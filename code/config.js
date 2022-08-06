const path = require("path");

function findOrAbort(name){
    if (!process.env[name])
        process.abort();
    return process.env[name]
}

function findOrDefault(name, defaultVal){
    if (!process.env[name])
        return defaultVal
    return process.env[name]
}

module.exports = {
    token: findOrAbort("API_TOKEN"),
    datafolder: path.resolve(findOrDefault("DATA_FOLDER", path.join(__dirname, "..", "data"))),
    channels: findOrDefault("CHANNELS","").split(/,\s?/g),
    colour: "#" + findOrDefault("COLOUR", "FF69B4")
}
