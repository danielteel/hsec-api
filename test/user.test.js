process.env.SUPER_PASSWORD = "superpass";
process.env.SUPER_USERNAME = "superuser";
process.env.DOMAIN = 'website.com';

const {mockNodemailer} = require('./mocks/nodemailer');
const {app} = require('../app.js');
const request = require('supertest')(app);
const {waitForKnexPromise, closeKnex, requestHelper} =require('./helpers');
const post = requestHelper.bind(null, request, 'post');
const get = requestHelper.bind(null, request, 'get');
const {getHash}=require('../common/common');
const {decryptAccessToken} = require('../common/accessToken');


let knex = null;
const superUser={email: process.env.SUPER_USERNAME, password: process.env.SUPER_PASSWORD, pass_hash: getHash(process.env.SUPER_PASSWORD), role: 'super'};


beforeAll( async done => {
    knex = await waitForKnexPromise();
    const [result] = await knex('users').select('id').where({email: process.env.SUPER_USERNAME});
    superUser.id=result.id;

    await post('user/login', superUser, (res)=>{
        superUser.cookies=res.headers['set-cookie'];
    }); 
    done();
})

afterAll( () => {
    return closeKnex();
});

beforeEach(()=>{
    mockNodemailer.clear();
});



describe("User", () => {
    
    const testUserDan = {email:'dan@test.com', password: '2wsxcde3@WSXCDE#'};
    let testUserJeff = {email:'jeff@test.com', password: '3edcxsw2#EDCXSW@'};


    it('POST /user/create, returns an error if sent wrong email data type', async (done) => {
        await post('user/create', {email: 123, password: '123qweasdzx!#QWEASDZC'}, (res)=>{
            expect(res.statusCode).toEqual(400);
        });
        done();
    });


    // <Route path='/signup'><Signup/></Route>
    // <Route path='/verifysignup/:email?/:confirmCode?'><VerifySignup/></Route>
    // <Route path='/forgotpassword/:email?'><ForgotPassword/></Route>
    // <Route path='/verifyforgot/:email?/:confirmCode?'><VerifyForgot/></Route>
    // <Route path='/login'><Login/></Route>

    it("POST /user/create, creates a user and sends a verification email", async (done) => {
        await post('user/create', testUserDan, async (res)=>{
            
            expect(res.statusCode).toEqual(201);
            expect(res.body).toEqual({email: testUserDan.email});
            
            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toBe(testUserDan.email);
            expect(mockNodemailer.sent[0].text).toContain('Email verification pin ');
            const [{verification_code: verifyCode}] = await knex('unverified_users').select('verification_code').where({email: testUserDan.email});
            expect(mockNodemailer.sent[0].html).toContain('<a href="https://'+process.env.DOMAIN+'/verifysignup/'+testUserDan.email+'/'+verifyCode+'">Click to confirm email</a>');
        });
        done();
    });    
    
    it("POST /user/create, sends an email saying this user has already registered and hasnt verified email yet", async (done) => {
        await post('user/create', testUserDan, async (res)=>{
            expect(res.statusCode).toEqual(201);
            expect(res.body).toEqual({email: testUserDan.email});

            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toEqual(testUserDan.email);
            expect(mockNodemailer.sent[0].text).toContain('Resending email verification pin')
            const [{verification_code: verifyCode}] = await knex('unverified_users').select('verification_code').where({email: testUserDan.email});
            expect(mockNodemailer.sent[0].html).toContain('<a href="https://'+process.env.DOMAIN+'/verifysignup/'+testUserDan.email+'/'+verifyCode+'">Click to confirm email</a>');
        });
        done();
    });

    it('POST /user/create and /user/verifyemail, rejects on bad passwords and verifying email replies back with user id', async (done) => {
        const verifyMessage = await post('user/create', testUserJeff, async (res)=>{
            expect(res.statusCode).toEqual(201);

            const [{verification_code: verifyCode}] = await knex('unverified_users').select('verification_code').where({email: testUserJeff.email})
            return {email: testUserJeff.email, password: testUserJeff.password, verifyCode: verifyCode};
        });

        await post('user/verifyemail', {email: testUserJeff.email, password: 123, verifyCode: verifyMessage.verifyCode}, (res)=>{
            expect(res.status).toBe(400);
            expect(res.text).toContain('expected password to be of type string');
        });

        await post('user/verifyemail', {email: testUserJeff.email, password: '12345', verifyCode: verifyMessage.verifyCode}, (res)=>{
            expect(res.status).toBe(400);
            expect(res.text).toContain('password is not legal');
        });

        await post('user/verifyemail', verifyMessage, (res)=>{
            expect(res.statusCode).toEqual(200);
            testUserJeff.id = res.body.id;
            testUserJeff.role = 'unverified';
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
            expect(res.body).toEqual({email: testUserJeff.email});

            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toBe(testUserJeff.email);
            expect(mockNodemailer.sent[0].text).toContain('This email is already registered and verified, use forgot password form to reset password')
            expect(mockNodemailer.sent[0].html).toContain('<a href="https://'+process.env.DOMAIN+'/forgotpassword/'+testUserJeff.email+'">Click to reset password</a>');
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

    it("POST /user/login, logging in with remember set to true will send back a cookie with an expiration date far in the future", async done => {
        await post('user/login', {...testUserJeff, remember: true}, (res)=>{
            expect(res.headers['set-cookie'][0]).toContain('Max-Age=31536000');
            expect(res.headers['set-cookie'][1]).toContain('Max-Age=31536000');
            expect(res.statusCode).toEqual(200);
        });
        done();
    });

    it('POST /user/changeemail, without access token fails', async (done) => {
        await post('user/changeemail', {newEmail: 'yolo@yolo.com'}, (res) => {
            expect(res.statusCode).toEqual(401);
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
            
        let verifyCode = await post('user/changeemail', {newEmail}, async (res) => {
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({status: 'verify current email'});
            expect(mockNodemailer.sent.length).toBe(1);
            expect(mockNodemailer.sent[0].to).toBe(testUserJeff.email);

            
            const [{current_verification_code: verifyCode}] = await knex('user_changeemail').select('current_verification_code').where({user_id: testUserJeff.id});

            expect(mockNodemailer.sent[0].html).toContain('<a href="https://'+process.env.DOMAIN+'/changeemail/'+verifyCode+'">Click to confirm old email</a>');
            return verifyCode;
        }, cookies);

        let newVerifyCode = await post('user/changeemail', {verifyCode}, async (res) => {
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({status: 'verify new email'});
            expect(mockNodemailer.sent.length).toBe(2);
            expect(mockNodemailer.sent[1].to).toBe(newEmail);
            
            const [{current_verification_code: verifyCode}] = await knex('user_changeemail').select('current_verification_code').where({user_id: testUserJeff.id});
            expect(mockNodemailer.sent[1].html).toContain('<a href="https://'+process.env.DOMAIN+'/changeemail/'+verifyCode+'">Click to confirm old email</a>');

            return verifyCode;
        }, cookies);

        await post('user/changeemail', {verifyCode: newVerifyCode}, (res) => {
            expect(res.statusCode).toEqual(201);
            const verifiedNewEmail = res.body;
            testUserJeff.email = verifiedNewEmail.email;
            expect(verifiedNewEmail).toEqual({email: newEmail});
        }, cookies);

        done();
    });

    it('GET /user/getchangeemail returns correct states', async (done) => {
        const newEmail = 'jeff@jeffjeff.com';

        let cookies;
        await post('user/login', testUserJeff, (res)=>{
            cookies=res.headers['set-cookie'];
            return decodeURIComponent(res.headers['set-cookie'][0].split('=')[1].split(';')[0]);
        });

        await get('user/getchangeemail', {}, (res) => {
            expect(res.body).toEqual({status: 'nochange'});
        }, cookies);   

        const verifyCode = await post('user/changeemail', {newEmail: newEmail}, async (res) => {
            const [{current_verification_code: code}] = await knex('user_changeemail').select('current_verification_code').where({user_id: testUserJeff.id});
            return code;
        }, cookies);

        await get('user/getchangeemail', {}, (res) => {
            expect(res.body).toEqual({status: 'verifyOld'});
        }, cookies);

        const newVerifyCode = await post('user/changeemail', {verifyCode: verifyCode}, async (res) => {
            const [{current_verification_code: code}] = await knex('user_changeemail').select('current_verification_code').where({user_id: testUserJeff.id});
            return code;
        }, cookies);

        await get('user/getchangeemail', {}, (res) => {
            expect(res.body).toEqual({status: 'verifyNew'});
        }, cookies);

        await post('user/changeemail', {verifyCode: newVerifyCode}, (res) => {
            testUserJeff.email = newEmail;
        }, cookies);

        await get('user/getchangeemail', {}, (res) => {
            expect(res.body).toEqual({status: 'nochange'});
        }, cookies);
        
        done();
    });

    it('POST /user/passwordchange with unregistered email provides a "valid" response', async (done) => {
        await post('user/passwordchange', {email: '2323423424@abc.com'}, (res)=>{
            expect(res.status).toBe(200);
            expect(res.body).toEqual({status: 'check email'});
        });
        done();
    });

    it('POST /user/passwordchange emails user with confirmation code', async (done) => {
        //Start password change process
        const confirmCode = await post('user/passwordchange', {email: testUserJeff.email}, (res)=>{
            expect(res.status).toBe(200);
            expect(res.body).toEqual({status: 'check email'});
            expect(mockNodemailer.sent[0].to).toBe(testUserJeff.email);
            expect(mockNodemailer.sent[0].text).toContain('A password reset request was sent for this email address, use the following confirmation code to reset it. ');

            const emailSplit = mockNodemailer.sent[0].text.split(' ');
            return emailSplit[emailSplit.length-1];
        });
        
        //Try and give it a non-legal password
        await post('user/passwordchange', {email: testUserJeff.email, confirmCode, newPassword: '123456789'}, (res)=>{
            expect(res.status).toBe(400);
            expect(res.text).toContain('password is not legal.');
        });

        //Test that entering wrong confirm code sends a new confirm code to users email
        const newConfirmCode = await post('user/passwordchange', {email: testUserJeff.email, confirmCode: '123', newPassword: '1qazxsw2!QAZXSW@'}, (res)=>{
            expect(res.status).toBe(200);
            expect(res.body).toEqual({status: 'check email'});
            expect(mockNodemailer.sent[1].to).toBe(testUserJeff.email);
            expect(mockNodemailer.sent[1].text).toContain('A password reset request was sent for this email address, use the following confirmation code to reset it. ');
            const emailSplit = mockNodemailer.sent[1].text.split(' ');
            return emailSplit[emailSplit.length-1];
        })

        //Successfully change password
        const newPassword = '12qwaszx!@QWASZX';
        await post('user/passwordchange', {email: testUserJeff.email, confirmCode: newConfirmCode, newPassword}, (res)=>{
            expect(res.status).toBe(201);
            expect(res.body).toEqual({status: 'success'});
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
            expect(res.body).toEqual({id: testUserJeff.id, email: testUserJeff.email, role: 'unverified'});
        }, cookies);
        done();
    });

    it('GET /user/me shows permissions for super user', async (done)=>{
        await get('user/me', {}, (res)=>{
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual({id: superUser.id, email: superUser.email, role: 'super'});
        }, superUser.cookies);
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
            expect(res.body).toEqual({id: testUserJeff.id, email: testUserJeff.email, role: testUserJeff.role});
        }, cookies);

        await post('user/logout', testUserJeff, (res)=>{
            cookies=res.headers['set-cookie'];
            expect(res.statusCode).toEqual(200);
        }, cookies); 

        await get('user/me', {}, (res)=>{
            expect(res.statusCode).toEqual(401);
            expect(res.body).toEqual({error: 'log in'});
        }, cookies);

        done();
    });

});