import DatabaseSyncError from "./errors/DatabaseSyncError";
import SyncConflictError from "./errors/SyncConflictError";
import type { BaseEntity, DatabaseModel } from "./utils/types";
import type { DataAccessObject } from "./database";
import authorizedFetch from "./authorized-fetch";
import Dexie from "dexie";

class SyncManager {
  private readonly model: DatabaseModel;

  private readonly dao: DataAccessObject;

  private readonly rejectionWhitelist: string[];

  private readonly apiUrl: string;

  syncInProgress: boolean;

  constructor(
    model: DatabaseModel,
    dao: DataAccessObject,
    apiUrl: string,
    syncRejectionWhitelist?: string[],
  ) {
    this.model = model;
    this.dao = dao;
    this.apiUrl = apiUrl;
    this.rejectionWhitelist = syncRejectionWhitelist ?? [];
    this.syncInProgress = false;
  }

  /**
   * Push all locally changed data to the server.
   * All changed entities are marked with a `isSuitableForPush` flag.
   */
  async _syncPush(): Promise<{ success: boolean }> {
    const pushableEntities = await Promise.all(
      Object.keys(this.model.entities).map(async (entityName) => {
        const entities = await this.dao
          .table(entityName)
          .where("isSuitableForPush")
          .equals(1)
          .toArray();

        if (entities.length === 0) {
          return;
        }

        for (const entity of entities) {
          // @ts-ignore `isSuitableForPush` exists on every entity
          delete entity.isSuitableForPush;
        }

        return [entityName, entities] as const;
      }),
    );

    const entitiesToPush = pushableEntities.filter(
      (entity): entity is [string, any[]] => entity !== undefined,
    );

    /**
     * No entities were changed/added since the last sync.
     */
    if (entitiesToPush.length === 0) {
      return {
        success: true,
      };
    }

    const pushBody = entitiesToPush.reduce(
      (acc, [entityName, entities]) => {
        acc[entityName] = entities;
        return acc;
      },
      {} as Record<string, Array<any>>,
    );

    console.log(`Pushing ${Object.keys(pushBody)} entities to the server.`);

    const pushResponse = await authorizedFetch(
      this.apiUrl + "/v1/lambdaconnect/push",
      {
        method: "POST",
        body: JSON.stringify(pushBody),
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    if (pushResponse.status !== 200) {
      let errorContent;
      try {
        errorContent = await pushResponse.json();
      } catch {
        errorContent = null;
      }
      /**
       * 42 - try again, skip next pull, and try to push again
       */
      if (errorContent?.["error-code"] === 42) {
        return {
          success: false,
        };
      }
      throw new DatabaseSyncError(
        `Error while pushing data to server: ${pushResponse.status}`,
        {
          pushPayload: pushBody,
          error: errorContent
            ? errorContent.errors?.english?.push
            : `Server responded with ${pushResponse.status}`,
          type: "push",
          code: errorContent?.["error-code"] || -1,
        },
      );
    }

    const data = await pushResponse.json();

    if (!data.success) {
      throw new DatabaseSyncError(
        "Server responded with an error while pushing data",
        {
          pushPayload: pushBody,
          error: data.errors?.english
            ? (Object.values(data.errors.english)?.[0] as string | undefined)
            : `Server responded with error code ${data["error-code"]}`,
          type: "push",
          code: data["error-code"] || -1,
        },
      );
    }

    const checkedRejectedObjects = Object.keys(data["rejected-objects"]).filter(
      (key) => !this.rejectionWhitelist.includes(key),
    );
    const checkedRejectedFields = Object.keys(data["rejected-fields"]).filter(
      (key) => {
        // flatten the rejected-fields of current object and filter out whitelisted field names
        const rejectedNotWhitelistedFields = Object.values(
          data["rejected-fields"][key],
        )
          .flat()
          .filter(
            (fieldName) =>
              !this.rejectionWhitelist.includes(fieldName as string),
          );
        // remove the key from rejected-fields object when the object has been whitelisted or all of its rejected fields are whitelisted
        return (
          !this.rejectionWhitelist.includes(key) &&
          Boolean(rejectedNotWhitelistedFields.length)
        );
      },
    );
    if (checkedRejectedObjects.length || checkedRejectedFields.length) {
      throw new SyncConflictError("The push was malformed", {
        pushPayload: pushBody,
        rejectedFields: data["rejected-fields"],
        rejectedObjects: data["rejected-objects"],
      });
    }

    return {
      success: true,
    };
  }

  async _syncPull(pullOptions?: { forcePullAll?: boolean }): Promise<void> {
    const entityLastRevisions: Record<string, number> = {};

    const entityNames = Object.keys(this.model.entities);

    /**
     * If forcePullAll is true, we want to pull all scoped data from the server, not just the changes.
     */
    if (pullOptions?.forcePullAll) {
      entityNames.forEach((entityName) => {
        entityLastRevisions[entityName] = 0;
      });
    } else {
      const syncRevisions = await Promise.all(
        entityNames.map(async (entityName) => {
          const lastSyncRevisionEntity = await this.dao
            .table<BaseEntity>(entityName)
            .orderBy("syncRevision")
            .last();
          const lastSyncRevision: number | undefined =
            lastSyncRevisionEntity?.syncRevision;
          return [entityName, lastSyncRevision] as const;
        }),
      );

      syncRevisions.forEach(([entityName, lastSyncRevision]) => {
        entityLastRevisions[entityName] = lastSyncRevision
          ? lastSyncRevision + 1
          : 0;
      });
    }

    console.log("Pulling data from the server...");

    const pullResponse = await authorizedFetch(
      this.apiUrl + "/v1/lambdaconnect/pull",
      {
        method: "POST",
        body: JSON.stringify(entityLastRevisions),
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    let body;
    try {
      body = await pullResponse.json();
    } catch {
      body = null;
    }
    if (pullResponse.status !== 200 || !body || !body.success) {
      throw new DatabaseSyncError(
        `Error while pulling data from the server: ${pullResponse.status}`,
        {
          type: "pull",
          code: body?.["error-code"] || -1,
          error: body?.toString?.(),
        },
      );
    }
    const data = JSON.parse(body.data);

    await this.monitoredBulkPut(data);
  }

  private async monitoredBulkPut(
    entitiesToPush: Record<string, Array<BaseEntity>>,
  ) {
    const tableNames = Object.keys(entitiesToPush);

    console.log(`Pulled new ${tableNames} entities from the server.`);

    await this.dao.transaction("rw!", tableNames, async () => {
      // @ts-ignore needed to skip table hooks on sync transactions
      Dexie.currentTransaction.__syncTransaction = true;

      for (const entityName of tableNames) {
        const entities = entitiesToPush[entityName]!;
        for (const entity of entities) {
          entity.isSuitableForPush = 0;
        }
        await this.dao.table(entityName).bulkPut(entities);
      }
    });
  }

  async sync(syncOptions?: {
    skipPush?: boolean;
    skipPull?: boolean;
    forcePullAll?: boolean;
  }): Promise<void> {
    this.syncInProgress = true;

    let shouldSkipPull = !!syncOptions?.skipPull;

    try {
      if (!syncOptions?.skipPush) {
        const { success } = await this._syncPush();
        /**
         * If the push was not successful, skip next pull and try to push again on the next cycle.
         */
        shouldSkipPull = shouldSkipPull || !success;
      } else {
        console.log("Skipping push...");
      }

      if (!shouldSkipPull) {
        await this._syncPull(syncOptions);
      } else {
        console.log("Skipping pull...");
      }
    } finally {
      this.syncInProgress = false;
    }
  }
}

export default SyncManager;
