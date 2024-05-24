const express = require('express');
const {authenticate} = require('../common/accessToken');
const { needKnex } = require('../database');
const {getHash, verifyFields, generateVerificationCode, isLegalPassword, isHexadecimal} = require('../common/common');
const fetch = require('node-fetch');

const {DeviceIO}=require('../deviceServer');

const router = express.Router();
module.exports = router;

async function getAndValidateDevices(knex, userRole, wantDevIO=false){
    let devices;
    if (userRole==='admin' || userRole==='super'){
        devices = await knex('devices').select(['id as device_id', 'name', 'encro_key']);
    }else{
        devices = await knex('devices').select(['id as device_id', 'name']);
    }
    const connectedDevices=DeviceIO.getDevices();
    for (const connectedDevice of connectedDevices){
        let isValid=false;
        for (const device of devices){
            if (connectedDevice?.name===device.name && ((userRole!='super' && userRole!='admin') || (connectedDevice?.key===device.encro_key))){
                isValid=true;
                if (wantDevIO) device.devio=connectedDevice;
                device.connected=true;
                if (connectedDevice?.actions){
                    device.actions=connectedDevice.actions;
                }
                break;
            }
        }
        if (!isValid){
            try{
                connectedDevice.onDeviceDatabaseDelete();
            }catch{}
        }
    }
    return devices;
}

async function getADevice(knex, userRole, deviceId, wantDevIO=false){
    let device;
    if (userRole==='admin' || userRole==='super'){
        device = await knex('devices').select(['id as device_id', 'name', 'encro_key']).where('id', deviceId);
    }else{
        device = await knex('devices').select(['id as device_id', 'name']).where('id', deviceId);
    }
    if (device.length){
        device=device[0];
        const connectedDevices=DeviceIO.getDevices();
        for (const connectedDevice of connectedDevices){
            if (connectedDevice.name===device.name){
                    if (wantDevIO) device.devio=connectedDevice;
                    device.connected=true;
                    if (connectedDevice.actions){
                        device.actions=connectedDevice.actions;
                    }
                    break;
            }
        }
        return device;
    }
    return null;
}

router.get('/list', [needKnex, authenticate.bind(null, 'member')], async (req, res) => {
    try {
        res.json(await getAndValidateDevices(req.knex, req.user.role));
    }catch(e){
        console.error('ERROR GET /devices/list', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.get('/image/:device_id', [needKnex, authenticate.bind(null, 'member')], async (req, res) => {
    try {
        const device_id = Number(req.params.device_id);

        const device=await getADevice(req.knex, req.user.role, device_id, true);
        if (device && device.devio){
            if (device.devio.image){
                res.writeHead(200, { 'content-type': 'image/jpeg' });
                return res.end(device.devio.image, 'binary');
            }else{
                return res.status(400).json({error: 'device hasnt sent an image yet'});
            }
        }

        return res.status(400).json({error: 'invalid device id or its not connected'});
    }catch(e){
        console.error('ERROR GET /devices/list', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/add', [needKnex, authenticate.bind(null, 'admin')], async (req, res)=>{
    try {
        const fields = [
            'name:string:*:t',
            'encro_key:string:*:t'
        ]
        let [fieldCheck, name, encro_key] = verifyFields(req.body, fields);
        if (!fieldCheck){
            if (name==='') fieldCheck+='name cannot be empty. ';
            if (typeof encro_key==='string' && encro_key.length!=64) fieldCheck+='encro_key length needs to be 64 hexadecimal characters. ';
            if (!isHexadecimal(encro_key)) fieldCheck+='encro_key needs to be hexadecimal character. ';
        }
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

        const deviceExists = await req.knex('devices').select(['name']).where('name', name);
        if (deviceExists.length) return res.status(400).json({error: 'device with name '+name+' already exists'});

        await req.knex('devices').insert({name, encro_key});

        res.json(await getAndValidateDevices(req.knex, req.user.role));
    }catch(e){
        console.error('ERROR POST /devices/add', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/update', [needKnex, authenticate.bind(null, 'admin')], async (req, res)=>{
    try {
        const fields = [
            'device_id:number',
            'name:string:*:t',
            'encro_key:string:*:t'
        ]
        let [fieldCheck, device_id, name, encro_key] = verifyFields(req.body, fields);
        if (!fieldCheck){
            if (name==='') fieldCheck+='name cannot be empty. ';
            if (typeof encro_key==='string' && encro_key.length!=64) fieldCheck+='encro_key length needs to be 64 hexadecimal characters. ';
            if (!isHexadecimal(encro_key)) fieldCheck+='encro_key needs to be hexadecimal character. ';
        }
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

        const deviceExists = await req.knex('devices').select(['id as device_id', 'name']).where('name', name);
        if (deviceExists.length){
            if (deviceExists[0].device_id!=device_id) return res.status(400).json({error: 'device with name '+name+' already exists'});
        }

        await req.knex('devices').update({name, encro_key}).where({id: device_id});

        res.json(await getAndValidateDevices(req.knex, req.user.role));
    }catch(e){
        console.error('ERROR POST /devices/update', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});

router.post('/delete', [needKnex, authenticate.bind(null, 'admin')], async (req, res)=>{
    try {
        const [fieldCheck, device_id] = verifyFields(req.body, ['device_id:number']);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});
        
        const deviceExists = await req.knex('devices').select(['id']).where('id', device_id);
        if (!deviceExists.length) return res.status(400).json({error: 'device with id '+device_id+' doesnt exist'});

        await req.knex('devices').where({id: device_id}).delete();

        res.json(await getAndValidateDevices(req.knex, req.user.role));
    }catch(e){
        console.error('ERROR POST /devices/delete', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});


router.post('/action', [needKnex, authenticate.bind(null, 'member')], async (req, res) => {
    try {
        const fields = [
            'device_id:number',
            'action:string:*:lt',
            'data:any:?'
        ]
        let [fieldCheck, device_id, action, data] = verifyFields(req.body, fields);
        if (fieldCheck) return res.status(400).json({error: 'failed field check: '+fieldCheck});

        const device = await getADevice(req.knex, req.user.role, device_id, true);

        if (device.devio){
            if (device.devio.sendAction(action, data)){
                return res.status(200).end();
            }
        }
    
        return res.status(400).json({error: 'failed to send action, either device not connected, or invalid action command'});
    }catch(e){
        console.error('ERROR POST /devices/action', req.body, e);
        return res.status(400).json({error: 'error'});
    }
});