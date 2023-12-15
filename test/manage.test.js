const {closeKnex, requestHelper, waitForKnexPromise} =require('./helpers');
const {getHash}=require('../common/common');

//Sets automatically created super user, set these before we require('../app.js') so database isnt seeded yet
process.env.SUPER_PASSWORD = "superpass";
process.env.SUPER_USERNAME = "superuser";

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
    done();

})

afterAll( () => {
    return closeKnex();
});



describe("Manage", () => {
    it('GET /manage/users returns 401/403 for non manager users', async (done)=>{
        await get('manage/users', {}, async (res)=>{
            expect(res.statusCode).toEqual(401);
        });    
        await get('manage/users', {}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testUnverifiedUser.cookies);    
        await get('manage/users', {}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testMemberUser.cookies);
        done();
    });

    it('GET /manage/users as manager returns all users except admins and fellow managers', async (done)=>{
        await get('manage/users', {}, async (res)=>{
            const usersExpected=testUsers.filter(u => ['unverified', 'member'].includes(u.role)).map(u=>({user_id: u.id, email: u.email, role: u.role}));
            res.body.sort((a,b)=>a.user_id-b.user_id);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual(usersExpected);
        }, testManagerUser.cookies);  
        done();
    });

    it('GET /manage/users as admin returns all users except fellow admins', async (done)=>{
        await get('manage/users', {}, async (res)=>{
            const usersExpected=testUsers.filter(u => ['unverified', 'member', 'manager'].includes(u.role)).map(u=>({user_id: u.id, email: u.email, role: u.role}));
            res.body.sort((a,b)=>a.user_id-b.user_id);
            
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual(usersExpected);
        }, testAdminUser.cookies);
        done();
    });

    it('GET /manage/users as super returns all users', async (done)=>{
        await get('manage/users', {}, async (res)=>{
            const usersExpected=testUsers.map(u=>({user_id: u.id, email: u.email, role: u.role}));
            res.body.sort((a,b)=>a.user_id-b.user_id);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual(usersExpected);
        }, testSuperUser.cookies);
        done();
    });

    it('GET /manage/users with role filter returns only users with that role', async done => {
        await get('manage/users/unverified', {}, async res => {
            const usersExpected=testUsers.filter(u=>u.role==='unverified').map(u=>({user_id: u.id, email: u.email, role: u.role}));
            res.body.sort((a,b)=>a.user_id-b.user_id);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual(usersExpected);
        }, testSuperUser.cookies);
        done();
    });
    it('GET /manage/users with role filter returns nothing when trying to get higher role', async done => {
        await get('manage/users/admin', {}, async res => {
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual([]);
        }, testManagerUser.cookies);
        done();
    });

    it('POST /manage/user/role with bad data fails', async (done) => {
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'shclem'}, async (res)=>{
            expect(res.statusCode).toEqual(400);
        }, testManagerUser.cookies);

        await post('manage/user/role', {user_id: '123', new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(400);
        }, testManagerUser.cookies);
        done();
    });

    it('POST /manage/user/role as manager CAN change unverified to members, and members to unverified', async (done) => {
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({user_id: testUnverifiedUser.id, email: testUnverifiedUser.email, role: 'member'});
        }, testManagerUser.cookies);

        //Setback to original state
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'unverified'}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({user_id: testUnverifiedUser.id, email: testUnverifiedUser.email, role: 'unverified'});
        }, testManagerUser.cookies);
        done();
    });
    
    it('POST /manage/user/role as admin CAN change unverified to members, members to managers, and managers to unverified', async (done) => {
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({user_id: testUnverifiedUser.id, email: testUnverifiedUser.email, role: 'member'});
        }, testAdminUser.cookies);

        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'manager'}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({user_id: testUnverifiedUser.id, email: testUnverifiedUser.email, role: 'manager'});
        }, testAdminUser.cookies);
        
        //Setback to original state
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'unverified'}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({user_id: testUnverifiedUser.id, email: testUnverifiedUser.email, role: 'unverified'});
        }, testAdminUser.cookies);
        done();
    });

    it('POST /manage/user/role as super CAN change unverified to members, members to managers, and managers to admins, admins to supers, and supers to unverified', async (done) => {
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({user_id: testUnverifiedUser.id, email: testUnverifiedUser.email, role: 'member'});
        }, testSuperUser.cookies);

        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'manager'}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({user_id: testUnverifiedUser.id, email: testUnverifiedUser.email, role: 'manager'});
        }, testSuperUser.cookies);

        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'admin'}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({user_id: testUnverifiedUser.id, email: testUnverifiedUser.email, role: 'admin'});
        }, testSuperUser.cookies);

        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'super'}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({user_id: testUnverifiedUser.id, email: testUnverifiedUser.email, role: 'super'});
        }, testSuperUser.cookies);
        
        //Setback to original state
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'unverified'}, async (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({user_id: testUnverifiedUser.id, email: testUnverifiedUser.email, role: 'unverified'});
        }, testSuperUser.cookies);
        done();
    });

    it('POST /manage/user/role returns 401/403 for non manager users', async (done)=>{
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(401);
        });    
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testUnverifiedUser.cookies);    
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testMemberUser.cookies);
        done();
    });

    it('POST /manage/user/role as manager CANNOT change a user to manager, admin, or super', async (done) => {
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'manager'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testManagerUser.cookies);

        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'admin'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testManagerUser.cookies);

        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'super'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testManagerUser.cookies);
        done();
    });

    it('POST /manage/user/role as admin CANNOT change a user to admin, or super', async (done) => {
        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'admin'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testAdminUser.cookies);

        await post('manage/user/role', {user_id: testUnverifiedUser.id, new_role: 'super'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testAdminUser.cookies);
        done();
    });

    it('POST /manage/user/role as manager CANNOT change permissions of equal or higher ranked user', async (done) => {
        await post('manage/user/role', {user_id: testManagerUser.id, new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testManagerUser.cookies);

        await post('manage/user/role', {user_id: testAdminUser.id, new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testManagerUser.cookies);

        await post('manage/user/role', {user_id: testSuperUser.id, new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testManagerUser.cookies);
        done();
    });
    
    it('POST /manage/user/role as admin CANNOT change permissions of equal or higher ranked user', async (done) => {
        await post('manage/user/role', {user_id: testAdminUser.id, new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testAdminUser.cookies);

        await post('manage/user/role', {user_id: testSuperUser.id, new_role: 'member'}, async (res)=>{
            expect(res.statusCode).toEqual(403);
        }, testAdminUser.cookies);
        done();
    });

    it('POST /manage/user/email admins can change less ranked accounts emails', async (done) => {
        await post('manage/user/email', {user_id: testUnverifiedUser, new_email: 'yolo@yolo.com'}, async res => {
            expect(res.statusCode).toEqual(200);
            await post('manage/user/email', {user_id: testUnverifiedUser, new_email: testUnverifiedUser.email}, null, testAdminUser.cookies);
        }, testAdminUser.cookies);

        await post('manage/user/email', {user_id: testManagerUser, new_email: 'yolo@yolo.com'}, async res => {
            expect(res.statusCode).toEqual(200);
            await post('manage/user/email', {user_id: testManagerUser, new_email: testManagerUser.email}, null, testAdminUser.cookies);
        }, testAdminUser.cookies);
        done();
    });
    it('POST /manage/user/email supers can change anyones emails', async (done) => {
        await post('manage/user/email', {user_id: testUnverifiedUser, new_email: 'yolo@yolo.com'}, async res => {
            expect(res.statusCode).toEqual(200);
            await post('manage/user/email', {user_id: testUnverifiedUser, new_email: testUnverifiedUser.email}, null, testSuperUser.cookies);
        }, testSuperUser.cookies);

        await post('manage/user/email', {user_id: testManagerUser, new_email: 'yolo@yolo.com'}, async res => {
            expect(res.statusCode).toEqual(200);
            await post('manage/user/email', {user_id: testManagerUser, new_email: testManagerUser.email}, null, testSuperUser.cookies);
        }, testSuperUser.cookies);

        await post('manage/user/email', {user_id: testAdminUser, new_email: 'yolo@yolo.com'}, async res => {
            expect(res.statusCode).toEqual(200);
            await post('manage/user/email', {user_id: testAdminUser, new_email: testAdminUser.email}, null, testSuperUser.cookies);
        }, testSuperUser.cookies);

        await post('manage/user/email', {user_id: testSuperUser, new_email: 'yolo@yolo.com'}, async res => {
            expect(res.statusCode).toEqual(200);
            await post('manage/user/email', {user_id: testSuperUser, new_email: testSuperUser.email}, null, testSuperUser.cookies);
        }, testSuperUser.cookies);
        done();
    });

});