var Mam = require('@iota/mam')
var selfMam = require('@iota/mam')
var IOTA = require('@iota/core')
const fs = require('fs');
const ipfsClient = require('ipfs-http-client');
const { spawnSync, spawn } = require("child_process");
const { trytesToAscii, asciiToTrytes } = require('@iota/converter')
const { execSync } = require("child_process");
const md5File = require('md5-file');

const ipfs = ipfsClient('/ip4/127.0.0.1/tcp/5001')

const mode = 'restricted'

const provider =  'https://nodes.comnet.thetangle.org:443';
let root;
let sideKey;
let pub_root;
var class_proc = {'classA':'1.py', 'classB':'2.py'}
var mamState = Mam.init(provider);
let selfSideKey = 'CONTROLLERONEOUTPUT99999999999999999999999999999999999999999999999999999999999999'
let selfSeed = 'CONTROLLERSEED9999999999999999999999999999999999999999999999999999999999999999999'
let selfMamState = selfMam.init(provider, selfSeed);
selfMamState = selfMam.changeMode(selfMamState, mode, selfSideKey);
let num = Number(fs.readFileSync('con_count.txt', 'utf8'));
num = num + 1;
selfMamState.channel.start = num
fs.writeFileSync('con_count.txt', num);
let status = '';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sleepWrapper(ms) {
    await sleep(ms);
}

async function getFromIPFS(ipfsPath) {
  const chunks = []
  for await (const chunk of ipfs.cat(ipfsPath)) {
      chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString()
}

const logData = data => {
    let resp = JSON.parse(trytesToAscii(data));
    if (resp.ipfs_hash.length != 0) {
    getFromIPFS(resp.ipfs_hash)
    .then( async buffer => {
        fs.writeFileSync('patch', buffer);
    })
  }
}

const get_root = async cn => {
    let rawdata = fs.readFileSync('class.json');
    let classes = JSON.parse(rawdata);
    root = fs.readFileSync('rr/rr.txt', 'utf8');
    sideKey = classes[cn]['sidekey'];
}

const publish = async packet => {
    const trytes = asciiToTrytes(JSON.stringify(packet));
    const message = selfMam.create(selfMamState, trytes);

    selfMamState = message.state;
    console.log(selfMamState);

    await selfMam.attach(message.payload, message.address, 3, 10);
    console.log('------------------------------------------------------------------------');
    console.log('Published to', packet, '\n');
    console.log('message root ', message.root);
    console.log('------------------------------------------------------------------------\n');
    return message.root;
}

async function publishPacket(status, hash) {
    const _root = await publish({
        status: status,
        hash: hash
    });
    return _root;
}

const read_restricted = async (cm) => {
    let m = await Mam.fetch(root, mode, sideKey, logData)
    fs.writeFileSync('rr/rr.txt', m.nextRoot);
    let hash = '';

    spawnSync('pkill', ["-f", class_proc[cm]], { stdio: 'inherit' });

    execSync("patch -p0 <patch", (error, stdout, stderr) => {
        if (error) {
            status = error.message;
            console.log(`exec error: ${error}`);
            return;
        }
    });

    spawn('python3', [class_proc[cm]], {
        stdio: 'ignore',
        detached: true
    }).unref();
    if (status.length == 0)
        status = 'ok'
    hash = md5File.sync(class_proc[cm]);
    await publishPacket(status, hash);

}

const logDataPub = async data => {
    let resp = JSON.parse(trytesToAscii(data));
    if (resp['class_name'] in class_proc) {
        await get_root(resp['class_name']);
        await sleepWrapper(5000);
        await read_restricted(resp['class_name']);
    }
    console.log(resp);
}


const read_public = async () => {
    let active = false
    setInterval(async () => {
        if (active) return
        active = true
        pub_root = fs.readFileSync('pr/pr.txt', 'utf8');
        let m = await Mam.fetch(pub_root, 'public', null, logDataPub);
        fs.writeFileSync('pr/pr.txt', m.nextRoot);
        active = false
    }, 5000)
}

async function mainWrap() {
    try {
        await read_public();
    } catch (e) {
        console.log(e)
    }
}

mainWrap();