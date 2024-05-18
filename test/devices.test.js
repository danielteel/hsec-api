const {closeKnex, requestHelper, waitForKnexPromise} =require('./helpers');
const {getHash}=require('../common/common');
const {DeviceIO}=require('../deviceServer');
//Sets automatically created super user, set these before we require('../app.js') so database isnt seeded yet
process.env.SUPER_PASSWORD = "superpass";
process.env.SUPER_USERNAME = "superuser";
process.env.DOMAIN = 'website.com';

const testSuperUser =       {email: process.env.SUPER_USERNAME, password: process.env.SUPER_PASSWORD, role: 'super'};
const testUnverifiedUser =  {email:'unverified@test.com',  password: 'password',  role: 'unverified'};
const testUnverifiedUser2 = {email:'unverified2@test.com', password: 'password',  role: 'unverified'};
const testMemberUser =      {email:'view@test.com',        password: 'password',  role: 'member'};
const testMemberUser2 =     {email:'view2@test.com',       password: 'password',  role: 'member'};
const testManagerUser =     {email:'manage@test.com',      password: 'password',  role: 'manager'};
const testManagerUser2 =    {email:'manage2@test.com',     password: 'password',  role: 'manager'};
const testAdminUser =       {email:'admin@test.com',       password: 'adminpass', role: 'admin'};
const testAdminUser2 =      {email:'admin2@test.com',      password: 'adminpass', role: 'admin'};
const testUsers=[testSuperUser, testUnverifiedUser, testUnverifiedUser2, testMemberUser, testMemberUser2, testManagerUser, testManagerUser2, testAdminUser, testAdminUser2];

const testDevice1 = {connect: true,  name: 'Garage', encro_key:'9a93f3723e03bb3a4f51b6d353982b3847447293149a1e9b706cb9ae876e183c', actions:[{title:'operate', type:'void', commandByte: 1}]};
const testDevice2 = {connect: true,  name: 'Stoop',  encro_key:'83204cefe804609e65ffba77a667d97f200b4e1102a7425ea8d0d2dbbdaf697d'};
const testDevice3 = {connect: false, name: 'Balcony',  encro_key:'14315df92804609e65efbc37a167d97f203b4e6102a2225ea8d0d2dccdaf647e'};
const testDevices = [testDevice1, testDevice2, testDevice3];
const testDeviceToAdd = {name:'TestDevice', encro_key: '052cd2a541f74a628c75c5300f609493f4c6177033334271b865ea337f870988'};

const {app} = require('../app.js');
const request = require('supertest')(app);
const post = requestHelper.bind(null, request, 'post');
const get = requestHelper.bind(null, request, 'get');
let knex = null;


async function insertUsers(db){
    for (const user of testUsers){
        user.pass_hash=getHash(user.password);
        if (user.email!==process.env.SUPER_USERNAME){
            const [result] = await db('users').insert({email: user.email, pass_hash: user.pass_hash, role: user.role}).returning('*');
            user.id = result.id;
        }else{
            const [result] = await db('users').select('id').where({email: process.env.SUPER_USERNAME});
            user.id=result.id;
        }
        
        await post('user/login', user, (res)=>{
            user.cookies=res.headers['set-cookie'];
        }); 

    }
    testUsers.sort((a,b)=>a.id-b.id);
}

async function insertDevices(db){
    for (const device of testDevices){
        const [result]=await db('devices').insert({name: device.name, encro_key: device.encro_key}).returning('*');
        device.id=result.id;
        if (device.connect){
            DeviceIO.addDevice({name: device.name, key: device.encro_key, actions: device.actions, lastTimeRecvd: 2500000000000});
        }
    }
}

beforeAll( async done => {
    knex = await waitForKnexPromise();
    await insertUsers(knex);
    await insertDevices(knex);
    done();

})

afterAll( () => {
    return closeKnex();
});



describe("Devices", () => {

    it('GET /devices/list returns 401/403 for non verified users', async (done)=>{
        await get('devices/list', {}, async (res)=>{
            expect(res.statusCode).toEqual(401);
        });
        await get('devices/list', {}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testUnverifiedUser.cookies);
        done();
    });

    it('POST /devices/action returns 401/403 for non verified users', async (done) => {
        await post('devices/action', {}, async (res)=>{
            expect(res.statusCode).toEqual(401);
        });
        await post('devices/action', {}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testUnverifiedUser.cookies);
        done();
    });


    it('POST /devices/add|delete|update returns 401/403 for non manager users', async (done)=>{
        const list=['add', 'delete', 'update'];
        for (const i of list){
            await post('devices/'+i, {}, async (res)=>{
                expect(i+String(res.statusCode)).toEqual(i+'401');
            });
            await post('devices/'+i, {}, async (res)=>{
                expect(i+String(res.statusCode)).toEqual(i+'403');
            }, testUnverifiedUser.cookies);    
            await post('devices/'+i, {}, async (res)=>{
                expect(i+String(res.statusCode)).toEqual(i+'403');
            }, testMemberUser.cookies);
        }
        done();
    });    

    it('GET /devices/list returns list of devices without encro_key for non admin users', async (done)=>{
        for (const user of [testMemberUser, testManagerUser]){
            await get('devices/list', {}, async (res)=>{
                expect(res.statusCode).toEqual(200);
                res.body.sort((a,b)=>a.device_id-b.device_id);
                
                const devicesExpected=testDevices.map( d => {
                    if (d.connect){
                        return {device_id: d.id, name: d.name, connected: true};
                    }
                    return {device_id: d.id, name: d.name};
                });
                expect(res.body).toEqual(devicesExpected);
    
            }, user.cookies);
        }

        done();
    });

    it('GET /devices/list returns list of devices with encro_key for admin users', async (done)=>{
        for (const user of [testAdminUser, testSuperUser]){
            await get('devices/list', {}, async (res)=>{
                expect(res.statusCode).toEqual(200);
                res.body.sort((a,b)=>a.device_id-b.device_id);
                
                const devicesExpected=testDevices.map( d => {
                    if (d.connect){
                        return {device_id: d.id, name: d.name, encro_key: d.encro_key, connected: true};
                    }
                    return {device_id: d.id, name: d.name, encro_key: d.encro_key};
                });
                expect(res.body).toEqual(devicesExpected);
    
            }, user.cookies);
        }

        done();
    });

    it('POST /devices/add adds a device', async (done)=>{
        let {statusCode, body: deviceList} = await post('devices/add', testDeviceToAdd, null, testAdminUser.cookies);
        expect(statusCode).toEqual(200);
        for (const device of deviceList){
            if (device.name===testDeviceToAdd.name){
                testDeviceToAdd.id=device.device_id;
            }
        }
        deviceList=deviceList.map(v=>({name: v.name, encro_key: v.encro_key, id: v.device_id}));
        expect(deviceList).toContainEqual(testDeviceToAdd);
        done();
    });

    it('POST /devices/add fails adding a device with existing device name', async (done)=>{
        let res = await post('devices/add', testDeviceToAdd, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        res = await post('devices/add', {...testDeviceToAdd, name: testDeviceToAdd.name+' '}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        done();
    });

    it('POST /devices/add fails with invalid parameters', async (done)=>{
        let res = await post('devices/add', {name:''}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        res = await post('devices/add', {encro_key:''}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        res = await post('devices/add', {name: '', encro_key:''}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        res = await post('devices/add', {name: 'asd', encro_key:''}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        res = await post('devices/add', {name: '', encro_key:'052cd2a541f74a628c75c5300f609493f4c6177033334271b865ea337f870988'}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        res = await post('devices/add', {name: 'asdasdasd', encro_key:'123abcdef'}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        res = await post('devices/add', {name: 'asdasdasd', encro_key:'G234567890123456789012345678901234567890123456789012345689012345'}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        done();
    });

    it('POST /devices/delete fails when given bad parameters', async (done)=>{
        let res = await post('devices/delete', {device_id: '0'}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        res = await post('devices/delete', {device_id:-10}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        res = await post('devices/delete', {}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(400);
        
        done();
    });

    it('POST /devices/delete deletes a device', async (done)=>{
        let {statusCode, body: deviceList} = await post('devices/delete', {device_id: testDeviceToAdd.id}, null, testAdminUser.cookies);
        expect(statusCode).toEqual(200);
        
        deviceList=deviceList.map(v=>({name: v.name, encro_key: v.encro_key, id: v.device_id}));
        expect(deviceList.length).not.toEqual(0);
        expect(deviceList).not.toContainEqual(testDeviceToAdd);
        done();
    });

});