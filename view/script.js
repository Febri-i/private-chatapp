const acceptFile = {};
const transferFile = {};
const chatOptions = [
	{
		label: "Block",
		cb: blockPerson,
	},
	{
		label: "Clear",
		cb: clearChat,
	},
	{
		label: "Add contact",
		cb: optAddContact,
	},
];
const rtcNegotiationCb = {
	acceptOffer: async (id, data, socket) => {
		const rtc = acceptFile[data.id].peer;
		rtc.addEventListener("datachannel", ({ channel }) => {
			channel.onopen = () => {
				toggleProgressLoader(acceptFile[data.id].progress);
			};
			channel.binaryType = "arraybuffer";
			channel.onmessage = (e) => {
				acceptFile[data.id].accepted += e.data.byteLength;

				acceptFile[data.id].buffer.push(e.data);
				updateProgress(
					acceptFile[data.id].progress,
					acceptFile[data.id].accepted
				);
				if (acceptFile[data.id].accepted >= acceptFile[data.id].size) {
					toggleProgressLoader(acceptFile[data.id].progress);
					new Promise((resolve, reject) => {
						let file;
						if (
							((file = new Blob(acceptFile[data.id].buffer)),
							{
								type: "octet/stream",
							})
						) {
							resolve(file);
							return;
						}

						reject("Failed to create file, IDK!");
					})
						.then((file) => {
							toggleProgressLoader(acceptFile[data.id].progress);
							document
								.getElementById(acceptFile[data.id].progress)
								.querySelector(".progressIcon").src =
								"/asset/icons/download.svg";
							document
								.getElementById(acceptFile[data.id].progress)
								.querySelector(".progressIcon").onclick =
								() => {
									downloadFile(
										file,
										acceptFile[data.id].filename
									);
									removeProgress(
										acceptFile[data.id].progress
									);
								};
							rtc.close();
						})
						.catch((err) => console.log(err));
				}
			};
		});

		rtc.onicecandidate = ({ candidate }) => {
			if (candidate) {
				socket.send(
					"r" +
						id +
						JSON.stringify({
							type: "newIce",
							candidate,
							id: data.id,
						})
				);
			}
		};

		rtc.addEventListener("close", () => {
			notify("RTC closed!");
			removeProgress(acceptFile[data.id].progress);
			delete acceptFile[data.id];
			socket.send("x" + id);
		});

		await rtc.setRemoteDescription(data.sdp);

		rtc.createAnswer().then(async (a) => {
			await rtc.setLocalDescription(a);
			socket.send(
				"r" +
					id +
					JSON.stringify({
						type: "setRemote",
						id: data.id,
						sdp: a,
					})
			);
		});
	},
	setRemote: (id, data) => {
		transferFile[data.id].peer.setRemoteDescription(data.sdp);
	},
	newIce: (id, data) => {
		if (!(transferFile[data.id] || acceptFile[data.id])) return;

		const rtc = (transferFile[data.id] || acceptFile[data.id]).peer;

		rtc.addIceCandidate(new RTCIceCandidate(data.candidate));
	},
};

const socketHandler = {
	e: (data) => notify(data),
	m: acceptMessage,
	o: () => {
		loadChatList();
		document.getElementById("loginContainer").style.display = "none";
	},
	q: (data, socket) => {
		createQuestion(
			data.substring(OFFER_ID_LENGTH),
			data.substring(0, OFFER_ID_LENGTH),
			socket
		);
	},
	r: (data) => {
		const fileInfo = JSON.parse(data);
		acceptFile[fileInfo.id] = {
			size: fileInfo.size,
			filename: fileInfo.filename,
			peer: new RTCPeerConnection(),
			accepted: 0,
			buffer: [],
			progress: createProgress(
				fileInfo.size,
				0,
				"/asset/icons/animated/download.gif"
			),
		};
		toggleProgressLoader(acceptFile[fileInfo.id].progress);
	},
	p: (data, socket) => {
		const rtcpData = JSON.parse(data.substring(RTCID_LENGTH));
		const id = data.substring(0, RTCID_LENGTH);
		(rtcNegotiationCb[rtcpData.type] || (() => {}))(id, rtcpData, socket);
	},
	x: (id) => {
		delete transferFile[id];
	},
	f: (data = "", socket) => {
		const fileId = data.substring(0, RTCID_LENGTH);
		if (transferFile[fileId] == undefined || transferFile[fileId].sending)
			return;

		const rtc = transferFile[fileId].peer;

		rtc.onicecandidate = ({ candidate }) => {
			if (candidate) {
				socket.send(
					"r" +
						data.substring(RTCID_LENGTH) +
						JSON.stringify({
							type: "newIce",
							candidate,
							id: fileId,
						})
				);
			}
		};

		transferFile[fileId].dataChannel = rtc.createDataChannel(fileId);

		transferFile[fileId].dataChannel.addEventListener("close", () => {
			document
				.getElementById(transferFile[fileId].progress)
				.querySelector(".progressIcon").src = "/asset/icons/check.svg";
			document
				.getElementById(transferFile[fileId].progress)
				.querySelector(".progressIcon").onclick = () => {
				removeProgress(transferFile[fileId].progress);
				if (transferFile[fileId]) delete transferFile[fileId];
			};
			rtc.close();
			setTimeout(() => {
				removeProgress(transferFile[fileId].progress);
				if (transferFile[fileId]) delete transferFile[fileId];
			}, 2000);
		});
		transferFile[fileId].dataChannel.onopen = (e) => {
			toggleProgressLoader(transferFile[fileId].progress);
			const fileReader = new FileReader();
			fileReader.readAsArrayBuffer(
				transferFile[fileId].file.slice(0, CHUNK_SIZE)
			);
			fileReader.onload = ({ target }) => {
				transferFile[fileId].sent += target.result.byteLength;

				e.target.send(target.result);
				updateProgress(
					transferFile[fileId].progress,
					transferFile[fileId].sent
				);
				if (
					transferFile[fileId].file.size > transferFile[fileId].sent
				) {
					new Promise(() => {
						target.readAsArrayBuffer(
							transferFile[fileId].file.slice(
								transferFile[fileId].sent,
								transferFile[fileId].sent + CHUNK_SIZE
							)
						);
					});
				}
			};
		};
		rtc.createOffer({
			offerToReceiveAudio: false,
			offerToReceiveVide: false,
		}).then(async (o) => {
			await rtc.setLocalDescription(o);
			socket.send(
				"r" +
					data.substring(RTCID_LENGTH) +
					JSON.stringify({
						type: "acceptOffer",
						id: fileId,
						sdp: o,
					})
			);
		});
	},
};

function removeProgress(progressId) {
	document.getElementById(progressId).remove();
	const progresses = document.getElementById("progresses");
	if (progresses.children.length) {
		progresses.style.right = `-${
			progresses.getBoundingClientRect().width
		}px`;
	}
}

function createQuestion(message, id) {
	const offer = document.getElementById("offer");
	offer.style.display = "flex";
	offer.style = "transform: translateX(calc(-100% - 50px));";
	offer.dataset.id = id;
	document.getElementById("offerMsg").textContent = message;
}

/**
 * Download file from given blob
 * @param {Blob} blob blob that we want to download
 */
function downloadFile(blob, filename) {
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	a.click();
}

document
	.getElementById("uploadInput")
	.addEventListener("change", ({ target }) => {
		if (target.value) {
			const input = document.getElementById("senderInput");
			input.style.opacity = 0.5;
			input.disabled = true;
			input.value = target.files[0].name;
			document.getElementById("filePortal").src = "/asset/icons/x.svg";
			return;
		}
	});

function pickFileUpInput() {
	const files = document.getElementById("uploadInput");

	if (files.value) {
		document.getElementById("uploadInput").value = null;
		const input = document.getElementById("senderInput");
		input.style.opacity = 1;
		input.disabled = false;
		input.value = "";
		document.getElementById("filePortal").src = "/asset/icons/upload.svg";
		return;
	}

	files.click();
}

function loginWS(password) {
	document.getElementById("account").value = null;
	const socket = new WebSocket("ws://localhost:" + WS_PORT);

	socket.addEventListener("message", ({ data }) => {
		(socketHandler[data[0]] || (() => {}))(data.substring(1), socket);
	});

	socket.addEventListener("open", () => {
		socket.send(
			`i${JSON.stringify({
				id: ACCOUNTDATA.id,
				key: ACCOUNTDATA.key,
				password: password,
			})}`
		);
	});

	const yesOffer = ({ target }) => {
		const offer = document.getElementById("offer");
		offer.style = "";

		function transEnd({ target }) {
			target.style.display = "none";
			target.removeEventListener("transitionend", transEnd);
		}

		offer.addEventListener("transitionend", transEnd);
		if (!(offer.dataset.id && offer.dataset.id.length == OFFER_ID_LENGTH))
			return;

		const yesno = target.textContent == "Yes" ? 1 : 0;

		socket.send("a" + yesno + offer.dataset.id);
	};
	const sendmsg = () => {
		const id = document.getElementById("sendmsg").dataset.id;
		const files = document.getElementById("uploadInput").files;
		if (files.length) {
			sendFile(files[0], id, socket);
		}
		const msg = document.getElementById("senderInput").value;
		document.getElementById("senderInput").value = "";
		sendMessage(msg, id, socket);
	};
	document.getElementById("sendmsg").addEventListener("click", sendmsg);
	document.getElementById("offer").addEventListener("click", yesOffer);
	socket.onclose = () => {
		document
			.getElementById("sendmsg")
			.removeEventListener("click", sendmsg);
		document.getElementById("offer").removeEventListener("click", yesOffer);
	};
}

/**
 * Sending file with WebRTC
 * @param {File} file data that we want to send
 * @param {string} id destination person id that we want to send data to
 * @param {WebSocket} socket socket that we want to use to negotiate the transfer
 */
function sendFile(file, id, socket) {
	const fileId = genID(FILEID_LENGTH);
	transferFile[fileId] = {
		file: file,
		sent: 0,
		rtcid: "",
		peer: new RTCPeerConnection(),
		sending: false,
		progress: createProgress(
			file.size,
			0,
			"/asset/icons/animated/upload.gif"
		),
	};
	toggleProgressLoader(transferFile[fileId].progress);
	socket.send(
		"f" +
			JSON.stringify({
				to: id,
				id: fileId,
				size: file.size,
				filename: file.name,
			})
	);
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

document.getElementById("loginbtn").addEventListener("click", () => {
	if (!document.getElementById("account").value) {
		return;
	}
	if (!validAccount(ACCOUNTDATA)) {
		notify("Invalid account data");
		return;
	}

	loginWS(document.getElementById("logPassword").value);
});

document.getElementById("account").addEventListener("change", ({ target }) => {
	const fileReader = new FileReader();
	const [file] = target.files;
	fileReader.readAsText(file);

	function loadAccData({ target }) {
		target.removeEventListener("load", loadAccData);
		if (file.name.substring(file.name.length - 4) !== "json") {
			const fileNameSplitted = file.name.split(".");
			notify(
				"Invalid file extension! ( " +
					fileNameSplitted[fileNameSplitted.length - 1] +
					" )"
			);
			return 0;
		}
		const loadedAccount = JSON.parse(fileReader.result);

		if (!validAccount(loadedAccount)) {
			notify("Invalid account! ( Incorrect Data )");
			return;
		}

		ACCOUNTDATA.id = loadedAccount.id;
		ACCOUNTDATA.key = loadedAccount.key;
		ACCOUNTDATA.contacts = loadedAccount.contacts;
		ACCOUNTDATA.messages = decryptMessages(loadedAccount.messages);
	}
	fileReader.addEventListener("load", loadAccData);
});

let onSignIn = false;
document.getElementById("signin").addEventListener("click", async () => {
	if (onSignIn) {
		notify("Be Patient");
		return;
	}

	const password = document.getElementById("passwordInput").value;
	if (!password.length) {
		return;
	}
	if (password.length < 8) {
		notify(`Come on, "${password}" ? Get a longer password`);
		return;
	}

	onSignIn = true;
	const response = await fetch(`/createaccount/${password}`).then((res) =>
		res.json()
	);
	if (Object.keys(response).length !== 2 && response.id.length !== 16) {
		notify("Invalid response, report to admin!");
		return;
	}
	ACCOUNTDATA.id = response.id;
	ACCOUNTDATA.key = response.key;
	onSignIn = false;
	saveData();
	return loginWS(password);
});

/**
 *
 * @param {string} id The person that were about to open id's
 */
function openChat(id = "") {
	if (id.length !== 16) return;

	ACCOUNTDATA.messages[id] = ACCOUNTDATA.messages[id] || [];
	document.getElementById("chatDef").style.display = "none";
	document.getElementById("chatName").textContent = getName(id);
	document.getElementById("sendmsg").dataset.id = id;
	const chatField = document.getElementById("chatContent");

	chatField.innerHTML = loadChat(id);

	chatField.scrollTop = chatField.scrollTopMax;
}

/**
 * Sending message to specified id
 * @param {string} message Message to be sent
 * @param {string} to Id of the person that we want send message to
 * @param {WebSocket} socket Our socket
 */
function sendMessage(message = "", to = "", socket) {
	if (message.length) {
		ACCOUNTDATA.messages[to] = ACCOUNTDATA.messages[to] || [];
		ACCOUNTDATA.messages[to].push("r" + message);
		appendMessage(to, "r" + message);
		updateChatList(to);
		socket.send("s" + to + ":" + message);
	}
}

function getSearch({ target }) {
	const suggestion = document.getElementById("suggestion");
	if (target.value < 1) {
		suggestion.innerHTML = "";
		return;
	}
	const result = Object.keys(ACCOUNTDATA.contacts)
		.filter(
			(id) =>
				id.startsWith(target.value) ||
				ACCOUNTDATA.contacts[id]
					.toLowerCase()
					.includes(target.value.toLowerCase())
		)
		.map(
			(id) =>
				`<span class="suggestion" onclick="applySearch('${id}')" >${ACCOUNTDATA.contacts[id]}<span style="opacity: 0.5; font-size: smaller;">#${id}</span></span>`
		);
	if (result.length) {
		suggestion.innerHTML = result.join("\n");
		return;
	}

	suggestion.innerHTML = "";
}

function applySearch(data = "") {
	document.getElementById("suggestion").innerHTML = "";
	document.getElementById("msgToId").value = data;
}

function addContact(e) {
	e.preventDefault();
	const id = document.getElementById("contactId").value || "";
	const name = document.getElementById("contactName").value || "";
	if (id.length !== 16) {
		notify("Invalid ID length, required 16 ( current " + id.length + " )");
		return;
	}

	if (!name) return;

	ACCOUNTDATA.contacts[id] = name;
	document.getElementById("tool").click();

	if (ACCOUNTDATA.messages[id])
		document.getElementById(id).querySelector(".name").innerText = name;
}

/**
 * Socket message event handler for accepting message
 * @listens socketHandler fired when the first character of message from socket is m
 */
function acceptMessage(message) {
	const from = message.substring(0, 16);
	if (!ACCOUNTDATA.blocked[from]) {
		const msg = "l" + message.substr(16);
		ACCOUNTDATA.messages[from] = ACCOUNTDATA.messages[from] || [];
		ACCOUNTDATA.messages[from].push(msg);
		appendMessage(from, msg);
		updateChatList(from);
	}
}

/**
 * Appending the message to specified id
 * @param {string} id Person id that we want to append message
 * @param {string} message The message that want to be appended
 */
function appendMessage(id, message) {
	if (document.getElementById("sendmsg").dataset.id == id) {
		const chatField = document.getElementById("chatContent");
		chatField.innerHTML += createMessageBubble(
			message.substring(1),
			message[0] == "l"
		);
		if (
			chatField.scrollHeight - chatField.scrollTop <
			chatField.getBoundingClientRect().height
		) {
			chatField.scroll({
				top: chatField.scrollHeight,
				left: 0,
				behavior: "smooth",
			});
		}
	}
}

function updateChatList(from) {
	const listChat = document.getElementById(from);
	if (listChat) {
		listChat.querySelector(".lastchat").textContent = getLastChat(from);
		return;
	}
	document.getElementById("chatlist").innerHTML += createChatList(
		from,
		getName(from),
		getLastChat(from)
	);
}

async function saveData() {
	const data = ACCOUNTDATA;
	data.messages = await encryptMessages(data.messages);
	const file = new Blob([JSON.stringify(data)], {
		type: "text/json",
	});
	const date = new Date();
	downloadFile(
		file,
		`Account_${date.getFullYear()}-${date.getMonth()}-${date.getDate()}_${date.getHours()}:${date.getMinutes()}.json`
	);
}

async function encryptMessages(messages = "", key = "") {
	return messages;
}

function decryptMessages(messages = "", key = "") {
	return messages;
}

function createProgress(max = 100, value = 0, icon = "") {
	const progresses = document.getElementById("progresses");
	progresses.style.right = "20px";
	const progressId = genID(16);
	progresses.innerHTML += `<div id="${progressId}" class="progress">
    <div class="progressContainer"><div data-max="${max}" style="width: ${
		(value / max) * 100
	}%;" class="progressValue"></div></div><img src="${icon}"  class="progressIcon" /></div>`;
	return progressId;
}

/**
 * Updating the value of progress from createProgress
 * @param {HTMLElement} progress progress from createProgress
 */
function updateProgress(progressId, value) {
	const progress = document.getElementById(progressId);
	const progressVal = progress.querySelector(".progressValue");
	progressVal.style.width = (value / progressVal.dataset.max) * 100 + "%";
}

function toggleProgressLoader(progressId) {
	const progressIcon = document
		.getElementById(progressId)
		.querySelector(".progressIcon");

	if (progressIcon) {
		const spinner = createSpinningLoader("25px", "5px");
		spinner.dataset.src = progressIcon.src;
		progressIcon.replaceWith(spinner);
		return;
	}

	const icon = document.createElement("img");
	icon.classList.add("progressIcon");
	icon.src = document
		.getElementById(progressId)
		.querySelector(".spinningLoader").dataset.src;
	document
		.getElementById(progressId)
		.querySelector(".spinningLoader")
		.replaceWith(icon);
}

/**
 *
 * @param {string} size Spinning loader height and width
 * @param {string} border Border size
 * @param {Object} bgColor Background for border color (r, g, b)
 * @param {Object} borderColor Border color (r, g, b)
 * @param {string} id Custom id
 * @returns {HTMLElement} HTML element for the loader
 */
function createSpinningLoader(
	size = 0,
	border = 0,
	bgColor = {
		r: 180,
		g: 180,
		b: 180,
	},
	borderColor = {
		r: 0,
		g: 0,
		b: 0,
	},
	id
) {
	const loader = document.createElement("div");
	if (id) loader.id = id;

	loader.classList.add("spinningLoader");
	loader.style = `border: ${border} solid rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b}); width: ${size}; height: ${size}; border-left: ${border} solid rgb(${borderColor.r}, ${borderColor.g}, ${borderColor.b})`;

	return loader;
}

/**
 * Loading chat
 * @param {string} id person id that we want to load the chat
 * @returns html template produced from the messages
 */
function loadChat(id) {
	return ACCOUNTDATA.messages[id]
		.map((message) =>
			createMessageBubble(message.substr(1), message[0] == "l")
		)
		.join("\n");
}

function loadChatList() {
	const chats = Object.keys(ACCOUNTDATA.messages);
	const chatList = document.getElementById("chatlist");
	for (let index = 0; index < chats.length; index++) {
		const id = chats[index];
		if (chats && chats.length) {
			chatList.innerHTML += createChatList(
				id,
				getName(id),
				getLastChat(id)
			);
		}
	}
}

function getLastChat(id = "") {
	return ACCOUNTDATA.messages[id]
		? (
				ACCOUNTDATA.messages[id][ACCOUNTDATA.messages[id].length - 1] ||
				""
		  ).substring(1)
		: "";
}

/**
 * Create chat list
 * @param {string} id
 * @param {string} name
 * @param {string} lastchat
 * @returns
 */
function createChatList(id, name, lastchat) {
	return `<div class="listchat" id="${id}" onclick="openChat('${id}')" ><span class="name">${name}</span><span class="lastchat">${lastchat}</span></div>`;
}

/**
 * Create message bubble
 * @param {string} message
 * @param {boolean} l is left side or right
 * @returns
 */
function createMessageBubble(message = "", l) {
	message = message.replaceAll("\n", "<br>");
	if (l)
		return `<div class="catccontainerl"><span class="chatcleft">${message}</span></div>`;

	return `<div class="catccontainerr"><span class="chatcright">${message}</span></div>`;
}

/**
 * Check if given account is valid or not
 * @param {object} account account object
 * @returns true if valid false if its not
 */
function validAccount(account) {
	return (
		Object.keys(account).length == 5 &&
		account.key &&
		account.id &&
		account.id.length == 16
	);
}

/**
 * Get name from an id itll, check from contacts
 * @param {string} id
 * @returns if the id is registered in contact itll return name from contacts
 */
function getName(id) {
	return ACCOUNTDATA.contacts[id] || id;
}

/**
 * generate random number at specified minmal and maximal value
 * @param {number} min minimal value
 * @param {number} max maximal value
 * @returns {number} random number
 */
function randRange(min, max) {
	return min + Math.round(Math.random() * (max - min));
}

/**
 * Create chat options at specified absolute coordinate
 * @param {number} x absolute X position for the options
 * @param {number} y absolute Y position for the options
 */
function chatOpt({ clientX, clientY }) {
	if (document.getElementById("optDialog")) {
		return;
	}

	const chatOpt = document.createElement("div");
	chatOpt.id = "optDialog";
	for (let i = 0; i < chatOptions.length; i++) {
		const optSpan = document.createElement("span");
		optSpan.onclick = chatOptions[i].cb;
		optSpan.innerText = chatOptions[i].label;
		chatOpt.appendChild(optSpan);
	}

	chatOpt.style = `position: absolute; transition: all 0.4s; opacity: 1;`;

	document.querySelector("body").appendChild(chatOpt);

	const boundRect = chatOpt.getBoundingClientRect();
	chatOpt.style.bottom = `${
		window.innerHeight - clientY - boundRect.height
	}px`;
	chatOpt.style.left = `${clientX - boundRect.width}px`;

	function delSelf() {
		document.removeEventListener("click", delSelf);
		fadeDown(
			chatOpt,
			() => {},
			window.innerHeight - clientY - boundRect.height - boundRect.height
		);
	}

	setTimeout(() => {
		document.addEventListener("click", delSelf);
	}, 350);
}

function clearChat() {
	const target = document.getElementById("sendmsg");
	if (target && ACCOUNTDATA.messages[target.dataset.id]) {
		createConfirmDialog(
			`Are you sure want to delete all the chat history with ${getName(
				target.dataset.id
			)}? this can't be undone`,
			() => {
				ACCOUNTDATA.messages[target.dataset.id] = [];
				openChat(target.dataset.id);
				updateChatList(target.dataset.id);
			}
		);
	}
}

function blockPerson() {
	const target = document.getElementById("sendmsg");
	if (target && target.dataset.id.length >= 16) {
		createConfirmDialog(
			`Are you sure want to block ${getName(target.dataset.id)}?`,
			() => {
				ACCOUNTDATA.blocked[target.dataset.id] = 1;
				saveData();
			}
		);
	}
}

function optAddContact() {
	const to = document.getElementById("sendmsg");
	if (to && to.dataset.id.length >= 16) {
		togglePopUp(
			`<form id="addContact"><input autocomplete="off" type="text" name="contactName" id="contactName" placeholder="Name"><input type="text" name="contactId" value="${to.dataset.id}" id="contactId" placeholder="Contact ID"><input type="image" src="/asset/icons/check.svg" onclick="addContact(event)" alt="Add contact"></form>`
		);
	}
}

/**
 * Create confirmation dialog
 * @param {string} msg Message for the confirmation
 * @param {function} yes callback when user agree
 * @param {function} no callback when user disagree
 */
function createConfirmDialog(msg = "", yes = () => {}, no = () => {}) {
	const dialog = document.createElement("div");
	dialog.className = "confirmDialog";
	const message = document.createElement("span");
	message.innerText = msg;
	const yesBtn = document.createElement("button");
	yesBtn.innerText = "Yes";
	const noBtn = document.createElement("button");
	noBtn.innerText = "No";
	yesBtn.onclick = () => fadeDown(dialog, yes);
	noBtn.onclick = () => fadeDown(dialog, no);
	const btnContainer = document.createElement("div");
	btnContainer.style = "display:flex;justify-content:right;";
	btnContainer.appendChild(yesBtn);
	btnContainer.appendChild(noBtn);
	dialog.appendChild(message);
	dialog.appendChild(btnContainer);

	document.querySelector("body").appendChild(dialog);
}

/**
 * remove dialog
 * @param {HTMLDivElement} element The dialog
 * @param {function} cb callback after dialog is dissappear
 * @param {number} bottom custom bottom value
 */
function fadeDown(element, cb = () => {}, bottom) {
	element.addEventListener("transitionend", ({ target }) => target.remove());
	element.style.opacity = 0;
	element.style.bottom = `${
		bottom || -element.getBoundingClientRect().height
	}px`;
	cb();
}
