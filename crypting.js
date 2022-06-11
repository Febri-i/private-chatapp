const {
    createDecipheriv,
    createCipheriv,
    scryptSync,
    timingSafeEqual,
} = require("crypto");

const secret = "xFEbxiXkj12345bnUrcAArchNGersXrx"

const iv = "mYmaHamXyXXn39sr"

const password = "babaoey";

const account = generateAccount(password);

function generateAccount(password) {
    const account = {
        id: genID(16),
        key: "",
        hashpass: ""
    };
    console.log(account.id);
    account.hashpass = hashPass(password, account.id);
    account.key = encrypt(hashPass(password, account.id), secret);
    return account;
}

function encrypt(input, key) {
    const chiper = createCipheriv("aes256", key, iv);
    return `${chiper.update(input, "utf-8", "hex") + chiper.final("hex")}`;
}

function decrypt(input, key) {
    const dechiper = createDecipheriv("aes256", key, iv);
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

function genID(length) {
    let str = "";
    for (let index = 0; index < length; index++) {
        const charType = Math.round(Math.random() * 2);
        if (charType == 1) {
            str += String.fromCharCode(randRange(97, 122));
        } else if (charType == 2) {
            str += String.fromCharCode(randRange(65, 90));
        } else {
            str += String.fromCharCode(randRange(48, 57));
        }
    }
    return str;
}

function randRange(min, max) {
    return min + Math.round(Math.random() * (max - min))
};