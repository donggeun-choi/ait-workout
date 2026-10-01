import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "ait-workout",
  brand: {
    primaryColor: "#3182F6", // 사용자 요청: TDS blue primary
  },
  permissions: [],
  webBundleDir: "dist",
});
