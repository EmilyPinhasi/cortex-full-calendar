import { readFileSync, writeFileSync, copyFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

// read manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// Copy manifest.json to the Obsidian plugin directory
copyFileSync(
  "manifest.json",
  "obsidian-dev-vault/.obsidian/plugins/full-calendar-remastered/manifest.json"
);