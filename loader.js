'use strict';

const fs = require('fs');
const yargs = require('yargs');
const ipfsClient = require('ipfs-http-client');
const Mam = require('@iota/mam');
const Mam1 = require('@iota/mam');
const Mam2 = require('@iota/mam');
const md5File = require('md5-file');

const { asciiToTrytes, trytesToAscii } = require('@iota/converter');

const ipfs = ipfsClient('/ip4/127.0.0.1/tcp/5001');
const mode = 'restricted';
const provider = 'https://nodes.comnet.thetangle.org:443';
const seed1 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9';
let sideKey;

const argv = yargs
    .command('add', 'Add a file entry to the IPFS and a file hash\nto the MAM channel for the specified class', {
        file: {
            description: 'path to the file',
            type: 'string',
        },
        class: {
            description: 'the class name',
            type: 'string',
        },
        controller: {
            description: "the controller name",
            type: 'string',
        },
        keep: {
            description: 'do not make changes to configuration files',
            type: 'boolean',
            default: false,
        }
    })
    .command('get', 'Get response from controllers', {
        file: {
            description: 'path to the file',
            type: 'string',
        },
        class: {
            description: 'the class name',
            type: 'string',
        },
        keep: {
            description: 'do not make changes to configuration files',
            type: 'boolean',
            default: false,
        }
    })
    .help()
    .alias('help', 'h')
    .argv;

let mamState1 = Mam1.init(provider, seed1);
let mamState;
let num = Number(fs.readFileSync('count.txt', 'utf8'));
num = num + 1;

mamState1.channel.start = num;

let rawdata;
let classes;
let class_name;
let root;

const publishPublic = async packet => {
    const trytes = asciiToTrytes(JSON.stringify(packet));
    const message = Mam1.create(mamState1, trytes);

    mamState1 = message.state;

    await Mam1.attach(message.payload, message.address, 3, 10);
    console.log('------------------------------------------------------------------------');
    console.log('Published to public ', packet, '\n');
    console.log('message root ', message.root);
    console.log('------------------------------------------------------------------------\n');
    return message.root;
}

async function publishPublicPacket() {
    const _root = await publishPublic({
        class_name: argv.class,
        timestamp: (new Date()).toLocaleString()
    });
    return _root;
}

const publish = async packet => {
    const trytes = asciiToTrytes(JSON.stringify(packet));
    const message = Mam.create(mamState, trytes);

    mamState = message.state;

    await Mam.attach(message.payload, message.address, 3, 10);
    console.log('------------------------------------------------------------------------');
    console.log('Published to ', argv.class,  'channel: ', packet, '\n');
    console.log('message root ', message.root);
    console.log('------------------------------------------------------------------------\n');
    return message.root;
}

async function publishPacket(ipfsHash) {
    const _root = await publish({
        ipfs_hash: ipfsHash,
        timestamp: (new Date()).toLocaleString()
    });
    return _root;
}

async function publishToIPFS(path) {
    let data = await fs.readFileSync(path);
    const addResponse = await ipfs.add(data);
    let ipfsHash;
    for await (const file of addResponse) {
        ipfsHash = file.path;
    }
    ;
    console.log("IPFS hash: ", ipfsHash, '\n');
    return ipfsHash;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sleepWrapper(ms) {
    await sleep(ms);
}

async function getResponse() {
    let rawController = fs.readFileSync('controller.json');
    let controllerData = JSON.parse(rawController);
    let expectOutput = []
    let expectKey = []

    for (const key in controllerData) {
      if (Object.keys(controllerData[key]['devices']).includes(argv.class)) {
          expectOutput.push(controllerData[key]['output']);
          expectKey.push(key);
      }
    }

    const logData = data => {
        let resp = JSON.parse(trytesToAscii(data));
        console.log(resp);
        console.log('\n');
        let hash = md5File.sync(argv.file);
        if (resp.hash == hash) {
            console.log('hashes is equal');
        } else {
            console.log('hashes is not equal');
        }
    }

    const execute = async (d, i) => {
        let m = await Mam2.fetch(d['root'] , mode, d['sideKey'], logData)
        controllerData[i]['output']['root'] = m.nextRoot;
    }

    var fe = new Promise((resolve, reject) => {
        expectKey.forEach(async function readMam(item) {
            await execute(controllerData[item]['output'], item);
            resolve()
            })
        });
    if (!argv.keep) {
        fe.then(() => {
            let json = JSON.stringify(controllerData);
            fs.writeFileSync('controller.json', json);
        });
    }
}

async function main() {
    publishToIPFS(argv.file)
    .then( async ipfsHash => {
        await publishPublicPacket(argv.class)
        let root = await publishPacket(ipfsHash);
        if (!argv.keep) {
            fs.writeFileSync('count.txt', num);
        }
    })
}

async function getWrap() {
    await getResponse();
}

if (argv._.includes('add')) {
    rawdata = fs.readFileSync('class.json');
    classes = JSON.parse(rawdata);
    class_name = classes[argv.class];
    sideKey = class_name['sidekey'];
    root = class_name['seed'];

    mamState = Mam.init(provider, root);
    mamState = Mam.changeMode(mamState, mode, sideKey);
    mamState.channel.start = num;
    mamState1 = Mam1.changeMode(mamState1, 'public', null);
    main()
} else if (argv._.includes('get')) {
    getWrap();
}