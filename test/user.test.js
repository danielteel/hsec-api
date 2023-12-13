const {mockNodemailer} = require('./mocks/nodemailer');
const {app} = require('../app.js');
const request = require('supertest')(app);

const {waitForKnex, closeKnex, requestHelper, getKnex} =require('./helpers');
const post = requestHelper.bind(null, request, 'post');
const get = requestHelper.bind(null, request, 'get');

const {getHash}=require('../common/common');

const {decryptAccessToken} = require('../common/accessToken');


let knex = null;

let roles = null;
function getRoleId(name){
    return roles.find(r => r.rolename===name).id;
}
function getRolePermissions(role_id){
    const role=roles.find(r => r.id===role_id);
    return {admin: role.admin, manage: role.manage, view: role.view};
}
const adminUser={email:'admin@admin.com', password: 'adminpass', pass_hash: getHash('adminpass')};

beforeAll( done => {
    waitForKnex(()=>{
        knex = getKnex();
        knex('roles').select('*').then((returnedRoles)=>{
            roles=returnedRoles;
            adminUser.role_id = getRoleId('admin');
            return knex('users').insert({email: adminUser.email, pass_hash: adminUser.pass_hash, role_id: adminUser.role_id}).returning('*');
        }).then(([insertedUser])=>{
            adminUser.id = insertedUser.id;
            done();
        });
    });
})

afterAll( () => {
    return closeKnex();
});

beforeEach(()=>{
    mockNodemailer.clear();
});




describe("User", () => {
    
    const testUserDan = {email:'dan@test.com', password: '2wsxcde3@WSXCDE#'};
    const testUserJeff = {email:'jeff@test.com', password: '3edcxsw2#EDCXSW@'};


    it('POST /user/create, returns an error if sent wrong email data type', async (done) => {
        await post('user/create', {email: 123, password: '123qweasdzx!#QWEASDZC'}, (res)=>{
            expect(res.statusCode).toEqual(400);
        });
        done();
    });

    it('POST /user/create, returns an error if sent wrong password data type', async (done) => {
        await post('user/create', {email: 'yolo@yolo.com', password: 123}, (res)=>{
            expect(res.statusCode).toEqual(400);
        });
        done();
    });

    it("POST /user/create, password must be between 8-36 characters, >=1 digit, >=1 lowercase, >=1 uppercase, >=1 special character", async (done) => {
        await post('user/create', {email: 'test@test.com', password: '12345'}, (res)=>{
            expect(res.status).toBe(400);
            expect(res.body).toContain('password is not legal');
        });
        done();
    });

    it("POST /user/create, creates a user and sends a verification email", async (done) => {
        await post('user/create', testUserDan, (res)=>{
            expect(res.statusCode).toEqual(201);
            expect(res.body).toBe(testUserDan.email);

            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toBe(testUserDan.email);
            expect(mockNodemailer.sent[0].text).toContain('Email verification pin')
        });
        done();
    });    
    
    it("POST /user/create, sends an email saying this user has already registered and hasnt verified email yet", async (done) => {
        await post('user/create', testUserDan, (res)=>{
            expect(res.statusCode).toEqual(201);
            expect(res.body).toBe(testUserDan.email);

            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toBe(testUserDan.email);
            expect(mockNodemailer.sent[0].text).toContain('Resending email verification pin')
        });
        done();
    });

    it('POST /user/create and /user/verifyemail, verifying email replies back with user id', async (done) => {

        const verifyMessage = await post('user/create', testUserJeff, (res)=>{
            expect(res.statusCode).toEqual(201);

            const emailSplit = mockNodemailer.sent[0].text.split(' ');
            const verifyCode = emailSplit[emailSplit.length-1];
            return {email: testUserJeff.email, verifyCode: verifyCode};
        })

        await post('user/verifyemail', verifyMessage, (res)=>{
            expect(res.statusCode).toEqual(200);
            testUserJeff.id = res.body;
            testUserJeff.role_id = getRoleId('unverified');
            expect(res.headers['set-cookie'][0]).toContain('Path=/; HttpOnly; Secure; SameSite=Lax');
            expect(res.headers['set-cookie'][0].split('=')[0]).toBe('accessToken');
            expect(res.headers['set-cookie'][1]).toContain('Path=/; Secure; SameSite=Lax');
            expect(res.headers['set-cookie'][1].split('=')[0]).toBe('hashcess');
        });

        done();
    });//Set timeout to 30 seconds in the case of running on rpi, its very slow
    
    it("POST /user/create, sends an email saying this user has already registered and has verified email", async (done) => {
        await post('user/create', testUserJeff, (res)=>{
            expect(res.statusCode).toEqual(201);
            expect(res.body).toBe(testUserJeff.email);

            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toBe(testUserJeff.email);
            expect(mockNodemailer.sent[0].text).toContain('This email is already registered and verified, use forgot password form to reset password.')
        });
        done();
    });

    it("POST /user/login, correct login details returns access token that decrypts to what an access token should look like", async (done) => {
        await post('user/login', testUserJeff, (res)=>{
            const accessToken = decodeURIComponent(res.headers['set-cookie'][0].split('=')[1].split(';')[0]);
            const hashcess = decodeURIComponent(res.headers['set-cookie'][1].split('=')[1].split(';')[0]);
            const decryptedAccessToken = decryptAccessToken(accessToken);

            expect(hashcess).toEqual(getHash(decryptedAccessToken.hashcess));

            expect(res.statusCode).toEqual(200);
            expect(decryptedAccessToken.id).toEqual(testUserJeff.id);
        });
        done();
    });

    it("POST /user/login, wrong login details fails and doesnt provide a access token", async (done) => {
        await post('user/login', {...testUserJeff, password: testUserJeff.password+'wrong'}, (res) => {
            expect(res.statusCode).toEqual(400);
            expect(res.headers['set-cookie']).toBe(undefined);
        });
        done();
    });

    it('POST /user/changeemail, without access token fails', async (done) => {
        await post('user/changeemail', {newEmail: 'yolo@yolo.com'}, (res) => {
            expect(res.statusCode).toEqual(401);
            expect(res.body).toBe("log in");
        });
        done();
    });

    it('POST /user/changeemail, with valid acccess token sends an email to current email, and then sends an email to the new email. Verifying both emails changes user email and returns new access token.', async (done) => {
        const newEmail = 'yoloswaggins@yolo.com';

        let cookies;
        await post('user/login', testUserJeff, (res)=>{
            cookies=res.headers['set-cookie'];
            expect(res.statusCode).toEqual(200);
            return decodeURIComponent(res.headers['set-cookie'][0].split('=')[1].split(';')[0]);
        });
            
        let verifyCode = await post('user/changeemail', {newEmail}, (res) => {
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBe('verify current email');
            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toBe(testUserJeff.email);

            const emailSplit = mockNodemailer.sent[0].text.split(' ');
            return emailSplit[emailSplit.length-1];
        }, cookies);

        let newVerifyCode = await post('user/changeemail', {verifyCode}, (res) => {
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBe('verify new email');
            expect(mockNodemailer.sent.length).toBe(2);
            expect(mockNodemailer.sent[1].to).toBe(newEmail);

            const emailSplit = mockNodemailer.sent[1].text.split(' ');
            return emailSplit[emailSplit.length-1];
        }, cookies);

        await post('user/changeemail', {verifyCode: newVerifyCode}, (res) => {
            expect(res.statusCode).toEqual(201);
            const verifiedNewEmail = res.body;
            testUserJeff.email = verifiedNewEmail;
            expect(verifiedNewEmail).toBe(newEmail);
        }, cookies);

        done();
    });

    it('POST /user/getchangeemail returns correct states', async (done) => {
        const newEmail = 'jeff@jeffjeff.com';

        let cookies;
        await post('user/login', testUserJeff, (res)=>{
            cookies=res.headers['set-cookie'];
            return decodeURIComponent(res.headers['set-cookie'][0].split('=')[1].split(';')[0]);
        });

        await post('user/getchangeemail', {}, (res) => {
            expect(res.body).toBe('nochange');
        }, cookies);   

        const verifyCode = await post('user/changeemail', {newEmail: newEmail}, (res) => {
            const emailSplit = mockNodemailer.sent[0].text.split(' ');
            return emailSplit[emailSplit.length-1];
        }, cookies);

        await post('user/getchangeemail', {}, (res) => {
            expect(res.body).toBe('verifyOld');
        }, cookies);

        const newVerifyCode = await post('user/changeemail', {verifyCode: verifyCode}, (res) => {
            const emailSplit = mockNodemailer.sent[1].text.split(' ');
            return emailSplit[emailSplit.length-1];
        }, cookies);

        await post('user/getchangeemail', {}, (res) => {
            expect(res.body).toBe('verifyNew');
        }, cookies);

        await post('user/changeemail', {verifyCode: newVerifyCode}, (res) => {
            testUserJeff.email = newEmail;
        }, cookies);

        await post('user/getchangeemail', {}, (res) => {
            expect(res.body).toBe('nochange');
        }, cookies);
        
        done();
    });

    it('POST /user/passwordchange with unregistered email provides a "valid" response', async (done) => {
        await post('user/passwordchange', {email: '2323423424@abc.com'}, (res)=>{
            expect(res.status).toBe(200);
            expect(res.body).toBe('check email');
        });
        done();
    });

    it('POST /user/passwordchange emails user with confirmation code', async (done) => {
        //Start password change process
        const confirmCode = await post('user/passwordchange', {email: testUserJeff.email}, (res)=>{
            expect(res.status).toBe(200);
            expect(res.body).toBe('check email');
            expect(mockNodemailer.sent[0].to).toBe(testUserJeff.email);
            expect(mockNodemailer.sent[0].text).toContain('A password reset request was sent for this email address, use the following confirmation code to reset it. ');

            const emailSplit = mockNodemailer.sent[0].text.split(' ');
            return emailSplit[emailSplit.length-1];
        });
        
        //Try and give it a non-legal password
        await post('user/passwordchange', {email: testUserJeff.email, confirmCode, newPassword: '123456789'}, (res)=>{
            expect(res.status).toBe(400);
            expect(res.body).toContain('password is not legal.');
        });

        //Test that entering wrong confirm code sends a new confirm code to users email
        const newConfirmCode = await post('user/passwordchange', {email: testUserJeff.email, confirmCode: '123', newPassword: '1qazxsw2!QAZXSW@'}, (res)=>{
            expect(res.status).toBe(200);
            expect(res.body).toBe('check email');
            expect(mockNodemailer.sent[1].to).toBe(testUserJeff.email);
            expect(mockNodemailer.sent[1].text).toContain('A password reset request was sent for this email address, use the following confirmation code to reset it. ');
            const emailSplit = mockNodemailer.sent[1].text.split(' ');
            return emailSplit[emailSplit.length-1];
        })

        //Successfully change password
        const newPassword = '12qwaszx!@QWASZX';
        await post('user/passwordchange', {email: testUserJeff.email, confirmCode: newConfirmCode, newPassword}, (res)=>{
            expect(res.status).toBe(201);
            expect(res.body).toBe('success');
        })

        //Try logging in with old password, expect to fail
        await post('user/login', testUserJeff, (res)=>{
            expect(res.statusCode).toEqual(400);
        })

        testUserJeff.password=newPassword;

        //Login with new password
        await post('user/login', testUserJeff, (res)=>{
            expect(res.statusCode).toEqual(200);
        })

        done();
    });

    it('GET /user/me', async (done)=>{
        let cookies;
        await post('user/login', testUserJeff, (res)=>{
            cookies=res.headers['set-cookie'];
            expect(res.statusCode).toEqual(200);
        }); 

        await get('user/me', {}, (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({id: testUserJeff.id, email: testUserJeff.email, ...getRolePermissions(testUserJeff.role_id)});
        }, cookies);
        done();
    });

    it('GET /user/me shows permissions for admin', async (done)=>{
        let cookies;
        await post('user/login', adminUser, (res)=>{
            cookies=res.headers['set-cookie'];
            expect(res.statusCode).toEqual(200);
        }); 

        await get('user/me', {}, (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({id: adminUser.id, email: adminUser.email, ...getRolePermissions(adminUser.role_id)});
        }, cookies);
        done();
    });

    it('POST /user/logout', async (done) => {
        let cookies;
        await post('user/login', testUserJeff, (res)=>{
            cookies=res.headers['set-cookie'];
            expect(res.statusCode).toEqual(200);
        }); 

        await get('user/me', {}, (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({id: testUserJeff.id, email: testUserJeff.email, ...getRolePermissions(testUserJeff.role_id)});
        }, cookies);

        await post('user/logout', testUserJeff, (res)=>{
            cookies=res.headers['set-cookie'];
            expect(res.statusCode).toEqual(200);
        }, cookies); 

        await get('user/me', {}, (res)=>{
            expect(res.statusCode).toEqual(401);
            expect(res.body).toEqual('log in');
        }, cookies);

        done();
    });

});