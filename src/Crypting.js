const CONFIG = require("./Config");
const {
    createDecipheriv,
    createCipheriv,
    scryptSync,
    timingSafeEqual,
} = require("crypto");


function encrypt(input, key) {
    const chiper = createCipheriv("aes256", key, CONFIG.IV);
    return `${chiper.update(input, "utf-8", "hex") + chiper.final("hex")}`;
}

function decrypt(input, key) {
    const dechiper = createDecipheriv("aes256", key, CONFIG.IV);
    return dechiper.update(input, "hex", "utf-8") + dechiper.final("utf-8")
}


function hashPass(input, salt) {
    return scryptSync(input, salt, 64).toString("hex");
}

function cmpPass(pass, hash, salt) {
    const hashedBuffer = scryptSync(pass, salt, 64);

    const keyBuffer = Buffer.from(hash, "hex");
    return timingSafeEqual(keyBuffer, hashedBuffer);
}

module.exports = {
    encrypt,
    decrypt,
    hashPass,
    cmpPass,
}