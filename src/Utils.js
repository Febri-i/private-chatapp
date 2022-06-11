const CONFIG = require("./Config.js")

const {
    encrypt,
    decrypt,
    hashPass,
    cmpPass
} = require("./Crypting.js");


/**
 * Generate account from password with random id
 * @param {string} password Account's password 
 * @returns account object
 */
function generateAccount(password) {
    const account = {
        id: genID(16),
        key: ""
    };
    account.key = encrypt(hashPass(password, account.id), CONFIG.SECRET);
    return account;
}

/**
 * Checking if the key was valid with password
 * @param {string} password password that we want to check 
 * @param {string} key account key
 * @param {string} id account id
 * @returns {boolean} true if its valid false if its not
 */
function passwordCheck(password = "", key, id) {
    return cmpPass(password, decrypt(key, CONFIG.SECRET), id);
}

/**
 * Generate random string with specified length
 * @param {number} length id length
 * @returns generated id
 */
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

/**
 * generate random number at specified minmal and maximal value
 * @param {number} min minimal value 
 * @param {number} max maximal value
 * @returns {number} random number
 */
function randRange(min, max) {
    return min + Math.round(Math.random() * (max - min))
};


/**
 * Check if the specified object is valid account
 * @param {object} account account object 
 * @returns {boolean} true if its valid false if its not
 */
function validAccount(account) {
    return (Object.keys(account).length >= 3 && account.key && account.id && account.id.length == 16);
}

/**
 * Preprocess html with replacing all the string between <% and %> to the value from object 
 * @example <%value.val%> -> paramenter[value][val]
 * @param {string} html html that we want to process 
 * @param {object} parameter object with value that we want to assign 
 * @returns {string} preprocessed html
 */
function preprocessHtml(html = "", parameter = {}) {
    let prefixIndex = html.indexOf("<%");
    while (prefixIndex > 0) {
        const subfixIndex = html.indexOf("%>");
        if (subfixIndex < prefixIndex) {
            console.error("err parsing html\n\"", html, "\"\n", "param from", prefixIndex + " to " + subfixIndex);
            return html;
        }
        const startStr = html.substring(0, prefixIndex);
        const endStr = html.substring(subfixIndex + 2);
        const parameterName = html.substring(prefixIndex + 2, subfixIndex);
        html = startStr.concat(getNested(parameterName.split("."), parameter), endStr);
        prefixIndex = html.indexOf("<%");
    }
    return html;
}

/**
 * Get nested value with array
 * @example [a, b] -> obj[a][b]
 * @param {array} nest parameter that we want to use to dig object 
 * @param {object} obj nested object that we want to dig
 * @returns final value
 */
function getNested(nest = [], obj = {}) {
    let iterate = 0;
    let data = obj[nest[iterate]];
    iterate++;
    while (iterate < nest.length && (data = data[nest[iterate]])) {
        iterate++;
    }
    return data;
}

module.exports = {
    validAccount,
    generateAccount,
    passwordCheck,
    genID,
    randRange,
    preprocessHtml
}