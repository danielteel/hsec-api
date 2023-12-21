const {closeKnex, requestHelper, waitForKnexPromise} =require('./helpers');
const {getHash}=require('../common/common');
const path = require('path');
const fs=require('fs');
const mockFetch=jest.fn(()=>require('./mocks/fetch'));
jest.mock('node-fetch', ()=>mockFetch);


//Sets automatically created super user, set these before we require('../app.js') so database isnt seeded yet
process.env.SUPER_PASSWORD = "superpass";
process.env.SUPER_USERNAME = "superuser";
process.env.FFMPEG_SECRET = '1twoputitinmyshoe';
process.env.FFMPEG_PORT = '4003';
process.env.CAM_DIR=path.join(__dirname,'mockfiles/');

const testFormats = [
    {type: 'jpg', file: 'abc.jpg', title:'abc', w: 640, h:360, qual: 12, fps: 0.66, block: null},
    {type: 'jpg', file: 'def.jpg', title:'def', w: 1280, h:720, qual: 11, fps: 0.66, block: null},
    {type: 'hls', file: 'ghi.m3u8', title:'ghi', w: 640, h: 360, qual: 24, fps: 4, block: 2},
    {type: 'hls', file: 'jkl.m3u8', title:'jkl', w: 1280, h: 720, qual: 24, fps: 4, block: 2}
];

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

beforeAll( async done => {
    knex = await waitForKnexPromise();
    await insertUsers(knex);
    await knex('formats').insert(testFormats);
    done();

})

afterAll( () => {
    return closeKnex();
});

beforeEach( ()=>{
    mockFetch.mockClear();
});


describe("Cam", () => {

    it('GET /cam/file for no user fails to fetch', async (done)=>{
        await get('cam/123.m3u8', {}, (res)=>{
            expect(res.statusCode).toEqual(401);
        });
        done();
    });

    it('GET /cam/file for unverified user fails to fetch', async (done)=>{
        await get('cam/123.m3u8', {}, (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testUnverifiedUser.cookies);
        done();
    });

    it('GET /cam/file for authorized users works', async (done)=>{
        const authUsers = [testMemberUser, testManagerUser, testAdminUser, testSuperUser];
        const fileToGet = 'blah.m3u8';
        
        for (const user of authUsers){
            await get('cam/'+fileToGet, {}, (res)=>{
                expect(res.statusCode).toEqual(200);
                expect(res.text).toEqual(fs.readFileSync(path.join(__dirname,'mockfiles',fileToGet),'utf-8'));
            }, user.cookies);
        }
        done();
    });

    it('GET /cam/file with invalid file fails', async (done)=>{
        const fileToGet = 'sdfsdfklafsdk.m3u8';
        await get('cam/'+fileToGet, {}, (res)=>{
            expect(res.statusCode).toEqual(404);
        }, testAdminUser.cookies);
        done();
    });

    it('GET /cam/details for unauthorized users fails to fetch', async (done)=>{
        await get('cam/details', {}, (res)=>{
            expect(res.statusCode).toEqual(401);
        });

        await get('cam/details', {}, (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testUnverifiedUser.cookies);
        done();
    });
    
    it('GET /cam/details for authorized users works', async (done)=>{
        const authUsers = [testMemberUser, testManagerUser, testAdminUser, testSuperUser];
        
        for (const user of authUsers){
            await get('cam/details', {}, (res)=>{
                expect(res.statusCode).toEqual(200);
            }, user.cookies);
        }
        done();
    });

    it('POST /cam/delete fails with unauthorized users', async done => {
        const formats = await knex('formats').select('*');
        const unauthUsers = [testUnverifiedUser, testMemberUser, testManagerUser];

        await post('cam/delete', {which: formats[0].id}, res=>{
            expect(res.statusCode).toEqual(401);
        });

        for (const user of unauthUsers){
            await post('cam/delete', {which: formats[0].id}, res=>{
                expect(res.statusCode).toEqual(403);
            }, user.cookies);
        }
        done();
    });

    it('POST /cam/delete deletes a format', async done => {
        const prevFormats = await knex('formats').select('*');

        const res = await post('cam/delete', {which: prevFormats[0].id}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(200);
        
        const nowFormats = await knex('formats').select('*');
        expect(res.body).toEqual(nowFormats);

        expect(nowFormats).toEqual(prevFormats.filter(f => f.id!==prevFormats[0].id));

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:'+process.env.FFMPEG_PORT+'/update/'+process.env.FFMPEG_SECRET);
        done();
    });
    
    it('POST /cam/delete deletes multiple formats', async done => {
        const prevFormats = await knex('formats').select('*');

        const res=await post('cam/delete', {which: [prevFormats[0].id, prevFormats[1].id]}, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(200);
        
        const nowFormats = await knex('formats').select('*');
        expect(res.body).toEqual(nowFormats);

        expect(nowFormats).toEqual(prevFormats.filter(f => f.id!==prevFormats[0].id && f.id!==prevFormats[1].id));

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:'+process.env.FFMPEG_PORT+'/update/'+process.env.FFMPEG_SECRET);
        done();
    });
    
    it('POST /cam/add fails with unauthorized users', async done => {
        const unauthUsers = [testUnverifiedUser, testMemberUser, testManagerUser];

        await post('cam/add', {type: 'jpg', file: 'il.jpg', title:'I-Lo', w: 640, h:360, qual: 12, fps: 0.66, block: null}, res=>{
            expect(res.statusCode).toEqual(401);
        });

        for (const user of unauthUsers){
            await post('cam/add', {type: 'jpg', file: 'il.jpg', title:'I-Lo', w: 640, h:360, qual: 12, fps: 0.66, block: null}, res=>{
                expect(res.statusCode).toEqual(403);
            }, user.cookies);
        }

        done();
    });

    it('POST /cam/add adds a jpg format as an admin', async done => {
        const prevFormats = await knex('formats').select('*');
        const formatToAdd = {id: null, type: 'jpg', file: 'il.jpg', title:'I-Lo', w: 640, h:360, qual: 12, fps: 0.66, block: 0};

        const res = await post('cam/add', formatToAdd, null, testAdminUser.cookies);
        expect(res.statusCode).toEqual(200);
        
        const nowFormats = await knex('formats').select('*');
        expect(res.body).toEqual(nowFormats);
    
        expect(nowFormats.map(r=>({...r, id: null}))).toEqual([...prevFormats, formatToAdd].map(r=>({...r, id: null})));
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:'+process.env.FFMPEG_PORT+'/update/'+process.env.FFMPEG_SECRET);
        done();
    });    

    it('POST /cam/add adds a hls format as a super', async done => {
        const prevFormats = await knex('formats').select('*');
        const formatToAdd = {id: null, type: 'hls', file: 'fsdgfdfg.m3u8', title:'sdfgsdfg', w: 640, h:360, qual: 12, fps: 0.66, block: 3};

        const res = await post('cam/add', formatToAdd, null, testSuperUser.cookies);
        expect(res.statusCode).toEqual(200);
        
        const nowFormats = await knex('formats').select('*');
        expect(res.body).toEqual(nowFormats);

        expect(nowFormats.map(r=>({...r, id: null}))).toEqual([...prevFormats, formatToAdd].map(r=>({...r, id: null})));
        
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:'+process.env.FFMPEG_PORT+'/update/'+process.env.FFMPEG_SECRET);
        done();
    });

    it('POST /cam/update fails for unauthed users', async done => {
        const prevFormats = await knex('formats').select('*');
        const formatToUpdate = prevFormats[0];

        formatToUpdate.title='new titleele';

        await post('cam/update', formatToUpdate, (res)=>{
            expect(res.statusCode).toEqual(401);
        });

        const unauthUsers = [testUnverifiedUser, testMemberUser, testManagerUser];
        for (const user of unauthUsers){
            await post('cam/update', formatToUpdate, (res)=>{
                expect(res.statusCode).toEqual(403);
            }, user.cookies);
        }
            
        done();
    });

    it('POST /cam/update updates a format', async done => {
        const users=[testAdminUser, testSuperUser];
        for (let i = 0; i<users.length;i++){
            const prevFormats = await knex('formats').select('*');
            const formatToUpdate = prevFormats[0];
            formatToUpdate.title='New Title'+i;
            formatToUpdate.file='New File'+i;
            formatToUpdate.type='jpg';
            formatToUpdate.w=123;
            formatToUpdate.h=321;
            formatToUpdate.fps=4.5;
            formatToUpdate.block=9;
            formatToUpdate.qual=2;

            const res = await post('cam/update', formatToUpdate, null, users[i].cookies);
            expect(res.statusCode).toEqual(200);

            const nowFormats = await knex('formats').select('*');
            expect(nowFormats).toEqual(prevFormats);
        }
        done();
    });
});