import { describe, expect, it, test } from "vitest";
import getIRFromXmlString, {
  Attribute,
  Constraint,
} from "../src/generate/ir.ts";

const modelFragmentXmlString = `
<model>
  <entity name="RAOwner" representedClassName="RAOwner" syncable="YES" codeGenerationType="class">
      <attribute name="active" attributeType="Boolean" defaultValueString="YES" usesScalarValueType="YES"/>
      <attribute name="createdAt" attributeType="Date" usesScalarValueType="NO"/>
      <attribute name="email" attributeType="String" regularExpressionString="\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b"/>
      <attribute name="internalUserId" attributeType="UUID" usesScalarValueType="NO"/>
      <attribute name="name" attributeType="String" maxValueString="100"/>
      <attribute name="referral" attributeType="String" maxValueString="100"/>
      <attribute name="surname" attributeType="String" maxValueString="100"/>
      <attribute name="updatedAt" attributeType="Date" usesScalarValueType="NO"/>
      <attribute name="uuid" attributeType="UUID" usesScalarValueType="NO"/>
      <relationship name="currentPaymentProfile" optional="YES" maxCount="1" deletionRule="Nullify" destinationEntity="RAPaymentProfile" inverseName="currentlyUsedBy" inverseEntity="RAPaymentProfile"/>
      <relationship name="employees" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="RAEmployee" inverseName="owner" inverseEntity="RAEmployee"/>
      <relationship name="paymentProfiles" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="RAPaymentProfile" inverseName="owner" inverseEntity="RAPaymentProfile"/>
      <relationship name="promoCode" optional="YES" maxCount="1" deletionRule="Nullify" destinationEntity="RAPromoCode" inverseName="owner" inverseEntity="RAPromoCode"/>
      <relationship name="refundableTransactions" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="RARefundableTransaction" inverseName="owner" inverseEntity="RARefundableTransaction"/>
      <relationship name="restaurants" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="RARestaurant" inverseName="owner" inverseEntity="RARestaurant"/>
      <relationship name="subscriptionState" optional="YES" maxCount="1" deletionRule="Nullify" destinationEntity="RASubscriptionState" inverseName="owner" inverseEntity="RASubscriptionState"/>
      <relationship name="subscriptionToBuy" optional="YES" maxCount="1" deletionRule="Nullify" destinationEntity="RASubscriptionProduct" inverseName="ownersToBeBoughtBy" inverseEntity="RASubscriptionProduct">
          <userInfo>
              <entry key="docs" value="Subscription to be bought by owner after the current subscription has expired"/>
          </userInfo>
      </relationship>
      <relationship name="vatPercentages" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="RAVatPercentage" inverseName="owner" inverseEntity="RAVatPercentage"/>
      <userInfo>
          <entry key="docs" value="Person who bought a license"/>
      </userInfo>
  </entity>
  <entity name="RARefundableTransaction" representedClassName="RARefundableTransaction" syncable="YES" codeGenerationType="class">
      <attribute name="active" attributeType="Boolean" defaultValueString="YES" usesScalarValueType="YES"/>
      <attribute name="createdAt" attributeType="Date" usesScalarValueType="NO"/>
      <attribute name="updatedAt" attributeType="Date" usesScalarValueType="NO"/>
      <attribute name="uuid" attributeType="UUID" usesScalarValueType="NO"/>
      <relationship name="owner" maxCount="1" deletionRule="Nullify" destinationEntity="RAOwner" inverseName="refundableTransactions" inverseEntity="RAOwner"/>
      <relationship name="payments" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="RAPayment" inverseName="refundableTransaction" inverseEntity="RAPayment"/>
      <relationship name="transactions" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="RATransaction" inverseName="refundableTransaction" inverseEntity="RATransaction"/>
      <userInfo>
          <entry key="docs" value="The purpose of this entity is to track transactions which create new payment profiles and are to be refunded immediately."/>
      </userInfo>
  </entity>
  <entity name="RARestaurant" representedClassName="RARestaurant" syncable="YES" codeGenerationType="class">
      <attribute name="active" attributeType="Boolean" defaultValueString="YES" usesScalarValueType="YES">
          <userInfo>
              <entry key="docs" value="Deleting RARestaurant will also trigger deleting objects connected with this object: RACategory via categories, RAMenu via menus, RAIngredient via ingredients"/>
          </userInfo>
      </attribute>
      <attribute name="createdAt" attributeType="Date" usesScalarValueType="NO"/>
      <attribute name="foodcostLowerThreshold" attributeType="Integer 32" minValueString="0" defaultValueString="33" usesScalarValueType="YES">
          <userInfo>
              <entry key="docs" value="Value foodcostLowerThreshold can't be higher than foodcostUpperThreshold."/>
              <entry key="deprecated" value="Fake deprecation notice"/>
          </userInfo>
      </attribute>
      <attribute name="foodcostUpperThreshold" attributeType="Integer 32" maxValueString="100" defaultValueString="66" usesScalarValueType="YES">
          <userInfo>
              <entry key="docs" value="Value foodcostLowerThreshold can't be higher than foodcostUpperThreshold."/>
          </userInfo>
      </attribute>
      <attribute name="name" attributeType="String" maxValueString="100"/>
      <attribute name="requestedSubscriptionActive" attributeType="Boolean" defaultValueString="NO" usesScalarValueType="YES">
          <userInfo>
              <entry key="docs" value="Before subscription is downgraded, owner is encouraged to select which restaurants should be subscriptionActive by setting this flag to true."/>
          </userInfo>
      </attribute>
      <attribute name="subscriptionActive" attributeType="Boolean" defaultValueString="YES" usesScalarValueType="YES">
          <userInfo>
              <entry key="docs" value="Number of active restaurants with this flag set to true must be less or equal to maxRestaurants in current subscription product. New restaurant must have this flag set to true. If subscription tier is lowered, all flags are set to false."/>
          </userInfo>
      </attribute>
      <attribute name="unitSystem" attributeType="String" regularExpressionString="^(metric|imperial)$">
          <userInfo>
              <entry key="docs" value="Measurement system used in a restaurant. Set at the moment of the creation, cannot be changed later."/>
          </userInfo>
      </attribute>
      <attribute name="updatedAt" attributeType="Date" usesScalarValueType="NO"/>
      <attribute name="uuid" attributeType="UUID" usesScalarValueType="NO"/>
      <relationship name="categories" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="RACategory" inverseName="restaurant" inverseEntity="RACategory"/>
      <relationship name="employees" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="RAEmployee" inverseName="restaurants" inverseEntity="RAEmployee"/>
      <relationship name="ingredients" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="RAIngredient" inverseName="restaurant" inverseEntity="RAIngredient"/>
      <relationship name="mainMenu" optional="YES" maxCount="1" deletionRule="Nullify" destinationEntity="RAMenu" inverseName="mainMenuOfARestaurant" inverseEntity="RAMenu"/>
      <relationship name="menus" toMany="YES" deletionRule="Nullify" destinationEntity="RAMenu" inverseName="restaurant" inverseEntity="RAMenu"/>
      <relationship name="owner" maxCount="1" deletionRule="Nullify" destinationEntity="RAOwner" inverseName="restaurants" inverseEntity="RAOwner"/>
      <relationship name="simulations" optional="YES" toMany="YES" deletionRule="Nullify" destinationEntity="RABCGMatrixSimulation" inverseName="restaurant" inverseEntity="RABCGMatrixSimulation"/>
  </entity>
  <entity name="test" syncable="YES">
    <attribute name="stringAttr" attributeType="String" regularExpressionString="^a.*z$" maxValueString="100" minValueString="0" />
    <attribute name="uuidAttr" attributeType="UUID" />
    <attribute name="urlAttr" attributeType="URI" />
    <attribute name="numberAttr" attributeType="Integer 16" maxValueString="100" minValueString="0">
        <userInfo>
          <entry key="docs" value="Arbitrary documentation" />
          <entry key="deprecated" value="Deprecation notice" />
        </userInfo>
    </attribute>
  </entity>
</model>
`.trim();

describe("parsing xml string with data model", () => {
  test("model fragment", () => {
    const ir = getIRFromXmlString(modelFragmentXmlString);
    expect(ir).toBeTypeOf("object");
  });
});

describe("parsed xml is correct", () => {
  it("generates correct entities", () => {
    const ir = getIRFromXmlString(modelFragmentXmlString);

    expect(Array.isArray(ir)).toEqual(true);

    ir.forEach((entity) => {
      expect(entity).toBeTypeOf("object");
      expect(entity).toHaveProperty("name");
      expect(entity).toHaveProperty("docs");
      expect(entity).toHaveProperty("deprecated");
      expect(entity).toHaveProperty("attributes");
      expect(entity).toHaveProperty("relations");

      expect(entity.name).toBeTypeOf("string");
      expect(Array.isArray(entity.relations)).toEqual(true);
      expect(Array.isArray(entity.attributes)).toEqual(true);
    });
  });

  it("generates correct entity attributes", () => {
    const expectedOwnerAttributes: Array<Attribute> = [
      {
        name: "active",
        constraints: [{ kind: "required" }],
        docs: null,
        deprecated: null,
        type: "boolean",
      },
      {
        name: "createdAt",
        constraints: [{ kind: "required" }],
        docs: null,
        deprecated: null,
        type: "Date",
      },
      {
        constraints: [
          {
            kind: "regex",
            value: "/\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b/",
          },
          {
            kind: "required",
          },
        ],
        deprecated: null,
        docs: null,
        name: "email",
        type: "string",
      },
      {
        constraints: [
          {
            kind: "uuid",
          },
          {
            kind: "required",
          },
        ],
        deprecated: null,
        docs: null,
        name: "internalUserId",
        type: "string",
      },
      {
        constraints: [
          {
            kind: "maxLength",
            value: 100,
          },
          {
            kind: "required",
          },
        ],
        deprecated: null,
        docs: null,
        name: "name",
        type: "string",
      },
      {
        constraints: [
          {
            kind: "maxLength",
            value: 100,
          },
          {
            kind: "required",
          },
        ],
        deprecated: null,
        docs: null,
        name: "referral",
        type: "string",
      },
      {
        constraints: [
          {
            kind: "maxLength",
            value: 100,
          },
          {
            kind: "required",
          },
        ],
        deprecated: null,
        docs: null,
        name: "surname",
        type: "string",
      },
      {
        constraints: [
          {
            kind: "required",
          },
        ],
        deprecated: null,
        docs: null,
        name: "updatedAt",
        type: "Date",
      },
      {
        constraints: [
          {
            kind: "uuid",
          },
          {
            kind: "required",
          },
        ],
        deprecated: null,
        docs: null,
        name: "uuid",
        type: "string",
      },
    ];

    const ir = getIRFromXmlString(modelFragmentXmlString);

    const ownerAttributes = ir[0]?.attributes;

    expect(Array.isArray(ownerAttributes)).toEqual(true);
    expect(ownerAttributes?.length).toEqual(9);
    expect(ownerAttributes).toMatchObject(expectedOwnerAttributes);

    ir.flatMap((e) => e.attributes).forEach((attr) => {
      expect(attr).toBeTypeOf("object");
      expect(attr).toHaveProperty("name");
      expect(attr).toHaveProperty("docs");
      expect(attr).toHaveProperty("deprecated");
      expect(attr).toHaveProperty("type");
      expect(attr).toHaveProperty("constraints");

      expect(attr.name).toBeTypeOf("string");
      expect(attr.type).toBeTypeOf("string");
      expect(Array.isArray(attr.constraints)).toEqual(true);
    });
  });

  it("generates correct entity relations", () => {
    const expectedEntityRelations = [
      {
        deprecated: null,
        destinationEntity: "RAPaymentProfile",
        docs: null,
        name: "currentPaymentProfile",
        toMany: false,
      },
      {
        deprecated: null,
        destinationEntity: "RAEmployee",
        docs: null,
        name: "employees",
        toMany: true,
      },
      {
        deprecated: null,
        destinationEntity: "RAPaymentProfile",
        docs: null,
        name: "paymentProfiles",
        toMany: true,
      },
      {
        deprecated: null,
        destinationEntity: "RAPromoCode",
        docs: null,
        name: "promoCode",
        toMany: false,
      },
      {
        deprecated: null,
        destinationEntity: "RARefundableTransaction",
        docs: null,
        name: "refundableTransactions",
        toMany: true,
      },
      {
        deprecated: null,
        destinationEntity: "RARestaurant",
        docs: null,
        name: "restaurants",
        toMany: true,
      },
      {
        deprecated: null,
        destinationEntity: "RASubscriptionState",
        docs: null,
        name: "subscriptionState",
        toMany: false,
      },
      {
        deprecated: null,
        destinationEntity: "RASubscriptionProduct",
        docs: "Subscription to be bought by owner after the current subscription has expired",
        name: "subscriptionToBuy",
        toMany: false,
      },
      {
        deprecated: null,
        destinationEntity: "RAVatPercentage",
        docs: null,
        name: "vatPercentages",
        toMany: true,
      },
    ];

    const ir = getIRFromXmlString(modelFragmentXmlString);

    const ownerRelations = ir[0]?.relations;

    expect(Array.isArray(ownerRelations)).toEqual(true);
    expect(ownerRelations?.length).toEqual(9);
    expect(ownerRelations).toMatchObject(expectedEntityRelations);

    ir.flatMap((e) => e.relations).forEach((rel) => {
      expect(rel).toBeTypeOf("object");
      expect(rel).toHaveProperty("name");
      expect(rel).toHaveProperty("docs");
      expect(rel).toHaveProperty("deprecated");
      expect(rel).toHaveProperty("destinationEntity");
      expect(rel).toHaveProperty("toMany");

      expect(rel.destinationEntity).toBeTypeOf("string");
      expect(rel.toMany).toBeTypeOf("boolean");
    });
  });

  it("generates correct attribute constraints", () => {
    const ir = getIRFromXmlString(modelFragmentXmlString);
    const testEntity = ir.find((e) => e.name === "test");
    expect(testEntity).not.toEqual(undefined);

    const attributes = testEntity!.attributes;
    expect(Array.isArray(attributes)).toEqual(true);

    attributes.forEach((attr) => {
      expect(Array.isArray(attr.constraints)).toEqual(true);

      switch (attr.name) {
        case "stringAttr":
          expect(attr.type).toEqual("string");
          expect(attr.constraints).toContainEqual({
            kind: "maxLength",
            value: 100,
          } satisfies Constraint);
          expect(attr.constraints).toContainEqual({
            kind: "minLength",
            value: 0,
          } satisfies Constraint);
          expect(attr.constraints).toContainEqual({
            kind: "regex",
            value: "/^a.*z$/",
          } satisfies Constraint);
          expect(attr.constraints).toContainEqual({
            kind: "required",
          } satisfies Constraint);
          break;
        case "uuidAttr":
          expect(attr.type).toEqual("string");
          expect(attr.constraints).toContainEqual({
            kind: "uuid",
          } satisfies Constraint);
          expect(attr.constraints).toContainEqual({
            kind: "required",
          } satisfies Constraint);
          break;
        case "urlAttr":
          expect(attr.type).toEqual("string");
          expect(attr.constraints).toContainEqual({
            kind: "url",
          } satisfies Constraint);
          expect(attr.constraints).toContainEqual({
            kind: "required",
          } satisfies Constraint);
          break;
        case "numberAttr":
          expect(attr.type).toEqual("number");
          expect(attr.constraints).toContainEqual({
            kind: "int",
          } satisfies Constraint);
          expect(attr.constraints).toContainEqual({
            kind: "minValue",
            value: 0,
          } satisfies Constraint);
          expect(attr.constraints).toContainEqual({
            kind: "maxValue",
            value: 100,
          } satisfies Constraint);
          expect(attr.constraints).toContainEqual({
            kind: "required",
          } satisfies Constraint);
          break;
        default:
          throw new Error("attribute name not matched");
      }
    });
  });

  it("generates correct attribute documentation", () => {
    const ir = getIRFromXmlString(modelFragmentXmlString);
    const testEntity = ir.find((e) => e.name === "test");
    const testAttributes = testEntity!.attributes;

    const attributeWithDocs = testAttributes.find(
      (a) => a.name === "numberAttr",
    )!;
    const attributeWithoutDocs = testAttributes.find(
      (a) => a.name === "stringAttr",
    )!;

    expect(attributeWithDocs.docs).toBeTypeOf("string");
    expect(attributeWithDocs.docs).toEqual("Arbitrary documentation");

    expect(attributeWithDocs.deprecated).toBeTypeOf("string");
    expect(attributeWithDocs.deprecated).toEqual("Deprecation notice");

    expect(attributeWithoutDocs.docs).toEqual(null);
    expect(attributeWithoutDocs.deprecated).toEqual(null);
  });
});
