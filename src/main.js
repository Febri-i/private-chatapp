const WebsocketServer = require("./Websocket.js");

const CONFIG = require("./Config");
const fastify = require('fastify')();
const {
    readFileSync
} = require("fs")
const {
    generateAccount,
    preprocessHtml
} = require("./Utils.js");
const {
    fastifyStatic
} = require("fastify-static");

fastify.register(fastifyStatic, {
    root: CONFIG.ASSET,
    prefix: '/asset/'
});

fastify.register(fastifyStatic, {
    root: CONFIG.VIEW,
    prefix: '/',
    decorateReply: false
})

const preprocessed = preprocessHtml(readFileSync(CONFIG.VIEW + "index.html").toString(), CONFIG);

fastify.get('/', (req, res) => {
    res.type("text/html");
    res.send(preprocessed);
});

fastify.get("/favicon.ico", (req, res) => {
    res.sendFile("favicon.ico", CONFIG.VIEW);
})

fastify.get("/script.js", (req, res) => {
    res.sendFile("script.js", CONFIG.VIEW)
})

fastify.get("/style.css", (req, res) => {
    res.sendFile("style.css", CONFIG.VIEW)
})

fastify.get("/createaccount/:password", (req, res) => {
    res.type("application/json").send(generateAccount(req.params.password))
})

WebsocketServer.on("listening", () => {
    console.log("Websocket listening at " + CONFIG.WS_PORT);
})

fastify.listen({
    port: CONFIG.PORT
})