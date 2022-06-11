const fs = require("fs");
const path = require("path");
const {
    exit
} = require("process")
const rootDir = path.join(__dirname, '../');

function resParse(config = {}) {
    const keys = Object.keys(config);

    for (let index = 0; index < keys.length; index++) {
        const key = keys[index];

        if (typeof config[key] == "string" && config[key].includes("res://")) {
            const pathFile = path.join(rootDir, config[key].replace("res://", ""))
            if (!fs.existsSync(pathFile)) {
                console.error("ERR:58::FILE NOT FOUND::" + pathFile);
                exit(0);
            }
            config[key] = pathFile;
        } else if (typeof config[key] == "object") {
            config[key] = resParse(config);
        }
    }
    return config;
}

module.exports = (() => {
    if (!fs.existsSync(`${rootDir}/configuration.json`)) {
        console.error("ERR:23::FAILED TO LOAD CONFIGURATION FILE")
        exit(1);
    }
    const rawConfig = resParse(JSON.parse(fs.readFileSync(`${rootDir}/configuration.json`)));
    return rawConfig;
})();