const {verifyFields, isLegalPassword} = require('../common/common');


describe('common', ()=>{
    it('verifyFields extracts correct object props', ()=>{
        const testObj1 = {
            a: 'im a strang',
            b: 123.456,
            c: {message: 'hi'},
            d: (age) => (age>=21)
        }
        const [fieldCheck, strang, num, obj, func] = verifyFields(testObj1, ['a:string','b:number','c:object','d:function']);
        
        expect(strang).toBe(testObj1.a);
        expect(num).toBe(testObj1.b);
        expect(obj).toBe(testObj1.c);
        expect(func(21)).toBe(true);
    });

    it('verifyFields returns string with reasons why field checks failed', ()=>{
        const [fieldCheck] = verifyFields({},['a:string', 'b:string']);
        expect(fieldCheck).toBe('expected a to be of type string, recieved type undefined. expected b to be of type string, recieved type undefined.');
    });

    it('verifyFields passes when optional fields are missing', ()=>{
        const [fieldCheck] = verifyFields({},['a:string:?', 'b:string:?']);
        expect(fieldCheck).toBe('');
    });

    it('verifyFields returns changed string when modifiers are passed', ()=>{
        const testObj = {
            a: 'all lower',
            b: 'ALL UPPER',
            c: '    a    ',
            d: '  lower with white  ',
            e: '  UPPER WITH WHITE  ',
            f: '  UPPER and lower  ',
        }
        const [fieldCheck, a, b, c, d, e, f] = verifyFields(testObj, ['a:string:*:u', 'b:string:*:l', 'c:string:*:t', 'd:string:*:ut', 'e:string:*:lt', 'f:string:*:ul']);

        expect(fieldCheck).toBe('');
        expect(a).toBe('ALL LOWER');
        expect(b).toBe('all upper');
        expect(c).toBe('a');
        expect(d).toBe('LOWER WITH WHITE');
        expect(e).toBe('upper with white');
        expect(f).toBe('  UPPER AND LOWER  ');
    });

    it('verifyFields doesnt fail when modifiers are passed to non string thangs', ()=>{
        const testObj = {
            a: 123,
            b: null,
            c: ['a', 123],
            //d purposelfully missing
            e: {b: 'b'},
            f: (age)=>(age>=21),
        }
        const [fieldCheck, a, b, c, d, e, f] = verifyFields(testObj, ['a:number:*:u', 'b:object:*:l', 'c:object:*:t', 'd:any:?:ut', 'e:object:*:lt', 'f:function:*:ul']);

        expect(fieldCheck).toBe('');
        expect(a).toBe(testObj.a);
        expect(b).toBe(testObj.b);
        expect(c).toBe(testObj.c);
        expect(d).toBe(testObj.d);
        expect(e).toBe(testObj.e);
        expect(f).toBe(testObj.f);
    });

    it('isLegalPassword returns empty string for legal passwords', ()=>{
        const legalPasswords = [
            '123qweasdzxc!#QWEASDZC',
            '!Ab45678',
            '`~!@#$%^&*()-_=+\|]}[{;:\'"/?.>,<aA1',
            'pAsSwOrD1@3'
        ]

        for (const password of legalPasswords){
            expect(isLegalPassword(password)).toBe('');
        }
    });

    it('isLegalPassword returns fail string for illegal passwords', ()=>{
        //Too short, no upper and lower, no special
        expect(isLegalPassword('1234567')).toBe('must have at least one uppercase character. must have at least one lowercase character. must have at least one special character. must be at least 8 characters.');

        //Too long, no upper and lower, no special
        expect(isLegalPassword('1234567890123456789012345678901234567')).toBe('must have at least one uppercase character. must have at least one lowercase character. must have at least one special character. must be less than 36 characters.');

        //No special character
        expect(isLegalPassword('Aa1234567')).toBe('must have at least one special character.');

        //No upper case
        expect(isLegalPassword('a1234567*')).toBe('must have at least one uppercase character.');

        //no lower case
        expect(isLegalPassword('A1234567&')).toBe('must have at least one lowercase character.');

        //no numbers
        expect(isLegalPassword('ABCDefg!#')).toBe('must have at least one digit.');

        //leading space
        expect(isLegalPassword(' ABCDefg!#1')).toBe('no leading or trailing spaces allowed.');

        //trailing space
        expect(isLegalPassword('ABCDefg!#1 ')).toBe('no leading or trailing spaces allowed.');

        //not even a string
        expect(isLegalPassword(123)).toBe('must be a string.');
    });
});