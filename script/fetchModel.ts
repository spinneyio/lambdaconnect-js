import http from "http";

export function fetchModel(onSuccess: (model: string) => void) {
  http.get("http://api.testing.simpleclouds.com/api/v1/data-model", (resp) => {
    let data = "";

    resp.on("data", (chunk) => {
      data += chunk;
    });

    resp.on("end", () => {
      const { success, model } = JSON.parse(data);
      if (!success) {
        console.error("Couldn't fetch model");
        process.exit(1);
      }
      onSuccess(model);
    });
  });
}
