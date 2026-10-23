// Lets browsers install the Command Center as an app.
// It caches nothing, so every visit always loads the latest version.
self.addEventListener("fetch", () => {});
