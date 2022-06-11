const CONFIG = require("./Config.js");
const {
    join
} = require("path");
const {
    WebSocketServer
} = require("ws")


const {
    passwordCheck,
    genID
} = require("./Utils.js")

const {
    appendFile,
    readFile,
    unlink,
    writeFile
} = require("fs");
const {
    Socket
} = require("dgram");
const path = require("path");

const prefixCall = {
    "i": initAccount,
    "s": sendMessage,
    "a": offerAnswer,
    "f": sendFile,
    "r": (data, socket) => {
        if (socket.rtc[data.substring(0, CONFIG.RTCID_LENGTH)]) {
            Server.users[socket.rtc[data.substring(0, CONFIG.RTCID_LENGTH)]].send("p" + data);
            return;
        }

        socket.send("eError RTC gateway is expired");
    }
};

const Server = new WebSocketServer({
    port: CONFIG.WS_PORT
});

Server.users = {};
Server.pendingMsg = {};

Server.on("connection", (socket) => {
    socket.rtc = {};
    socket.offers = {};
    socket.on("message", data => {
        const message = data.toString();
        if (!prefixCall[message[0]]) {
            socket.send("ePayload error");
            return 0;
        }

        try {
            prefixCall[message[0]](message.substring(1), socket);
        } catch (error) {
            socket.send("eError failed to do task");
        }
    });

    socket.on("close", () => {
        if (Server.users[socket.id])
            delete Server.users[socket.id];
    })
});

function sendFile(data, socket) {
    const info = JSON.parse(data);
    createOffer(() => {
        const rtcId = genID(CONFIG.RTCID_LENGTH)
        socket.rtc[rtcId] = info.to;
        Server.users[info.to].rtc[rtcId] = socket.id;
        Server.users[info.to].send("r" + JSON.stringify({
            size: info.size,
            filename: info.filename,
            id: info.id
        }))
        socket.send("f" + info.id + rtcId);
        setTimeout(() => {
            if (socket.rtc[rtcId])
                delete socket.rtc[rtcId];
        }, 1200000);
    }, () => {
        socket.send("x" + info.id);
        delete Server.users[info.to].rtc[rtcId];
        if (socket.rtc[rtcId])
            delete socket.rtc[rtcId];
    }, `${socket.id} wants to send you file ${info.filename} size: ${info.size}`, Server.users[info.to]);
}

/**
 * Create offer to specified socket
 * @param {function} cb Called when the offer is accepted
 * @param {function} reject Called when the offer is rejected
 * @param {string} message Offer message
 * @param {WebSocket} socket destination socket 
 */
function createOffer(cb = () => {}, reject = () => {}, message = "", socket) {
    const id = genID(CONFIG.OFFER_ID_LENGTH);
    socket.offers[id] = {
        cb,
        reject
    };
    socket.send("q" + id + message);
}

function offerAnswer(data, socket) {
    const offerId = data.substring(1);
    if (!socket.offers[offerId])
        return;

    if (data[0] == "0")
        socket.offers[offerId].reject();

    else
        socket.offers[offerId].cb();

    delete socket.offers[offerId];
};

function sendMessage(params = "", socket) {
    const indexof = params.indexOf(":");
    const destination = params.substring(0, indexof);
    if (destination.length !== 16) {
        socket.send("eInvalid id.");
        return;
    }
    const msg = params.substring(indexof + 1);
    if (Server.users[destination]) {
        Server.users[destination].send(`m${socket.id}${msg}`)
        return;
    };

    addPending(socket.id, destination, msg);
};

function addPending(from, to, message) {
    readFile(join(CONFIG.PENDINGDIR, to), {
        encoding: "utf-8"
    }, (err, data) => {
        let pendings;
        if (err) {
            pendings = {};
        } else
            pendings = JSON.parse(data.toString());

        pendings[from] = pendings[from] || [];
        pendings[from].push(message);

        writeFile(join(CONFIG.PENDINGDIR, to), JSON.stringify(pendings), {
            encoding: "utf-8"
        }, () => {});

    })
}

function sendPending(socket) {
    readFile(join(CONFIG.PENDINGDIR, socket.id), {
        encoding: "utf-8"
    }, async (err, data) => {
        if (err)
            return;

        const pendings = JSON.parse(data.toString());
        const keys = Object.keys(pendings);

        for (let index = 0; index < keys.length; index++) {
            for (let indexMsg = 0; indexMsg < pendings[keys[index]].length; indexMsg++) {
                await socket.send(`m${keys[index]}${pendings[keys[index]][indexMsg]}`);
            }

        }
        unlink(join(CONFIG.PENDINGDIR, socket.id), () => {});
    })
};

function initAccount(params = "", socket) {
    const payload = JSON.parse(params);
    if (!passwordCheck(payload.password, payload.key, payload.id)) {
        socket.send("eError failed to authenticate")
        socket.close();
        return;
    };
    Server.users[payload.id] = socket;
    socket.id = payload.id;
    sendPending(socket);

    socket.send("o");
}


module.exports = Server;