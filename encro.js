
function leftRotate32(num,  places){
    return ((num << places) | (num >>> (32 - places))) & 0xFFFFFFFF;
}
function rightRotate32(num,  places){
    return ((num >>> places) | (num << (32 - places))) & 0xFFFFFFFF;
}
function leftRotate8(num,  places){
    return ((num << places) | (num >>> (8 - places))) & 0xFF;
}
function rightRotate8(num,  places){
    return ((num >>> places) | (num << (8 - places))) & 0xFF;
}

function frame(bytes){
    if (!(bytes instanceof Uint8Array)){
        throw 'frame expects data to be Uint8Array';
    }
    let paddingLength=4;
    const modLength = (4+2+bytes.length)%16
    if (modLength){
        paddingLength=16-modLength%16 + 4;
    }
    const framed = new Uint8Array(paddingLength+2+bytes.length);
    framed[0]=bytes.length >> 8;
    framed[1]=bytes.length & 0xFF;
    for (let i=0;i<paddingLength;i++){
        framed[2+i]=Math.floor(Math.random()*256);//Need more secure random number solution
    }
    framed.set(bytes, 2+paddingLength);
    return framed;
}

function encrypt(data, keyString){
    let key=[];
    if (typeof keyString==='string'){
        if (keyString.length!=64){
            throw "Invalid hex key length: "+keyString.length+". Needs to be 64.";
        }
        for (let i=0;i<keyString.length;i+=2){
            key[Math.floor(i/2)] = parseInt(keyString.substring(i, i+2), 16);
        }
    }else{
        if (keyString.length!=32){
            throw 'Invalid array key length:'+keyString.length+". Needs to be 32.";
        }
        key=keyString;
    }

    let buffer = frame(data);
    if (buffer.length>0xFFFF) throw 'data needs to be less than 0xFFF0 in size';

    for (let k=0;k<key.length;k++){
        for (let i=0;i<buffer.length-7;i+=1){

            let b4=leftRotate32(buffer[i+0] | buffer[i+2]<<8 | buffer[i+4]<<16 | buffer[i+6]<<24, key[k]%31);
            buffer[i+0] = b4 & 0xFF;
            buffer[i+2] = b4>>8 & 0xFF;
            buffer[i+4] = b4>>16 & 0xFF;
            buffer[i+6] = b4>>24 & 0xFF;
            
            b4=leftRotate32(buffer[i+1] | buffer[i+3]<<8 | buffer[i+5]<<16 | buffer[i+7]<<24, key[k]%31);
            buffer[i+1] = b4 & 0xFF;
            buffer[i+3] = b4>>8 & 0xFF;
            buffer[i+5] = b4>>16 & 0xFF;
            buffer[i+7] = b4>>24 & 0xFF;

            buffer[i+0] ^= buffer[i+1];
            buffer[i+1] ^= buffer[i+2];
            buffer[i+2] ^= buffer[i+3];
            buffer[i+3] ^= buffer[i+4];
            buffer[i+4] ^= buffer[i+5];
            buffer[i+5] ^= buffer[i+6];
            buffer[i+6] ^= buffer[i+7];
            buffer[i+7] ^= buffer[i+0];

            buffer[i+0] ^= key[k];
            buffer[i+1] ^= leftRotate8(key[k], 0 + buffer[i+0]%2);
            buffer[i+2] ^= leftRotate8(key[k], 1 + buffer[i+1]%2);
            buffer[i+3] ^= leftRotate8(key[k], 2 + buffer[i+2]%2);
            buffer[i+4] ^= leftRotate8(key[k], 3 + buffer[i+3]%2);
            buffer[i+5] ^= leftRotate8(key[k], 4 + buffer[i+4]%2);
            buffer[i+6] ^= leftRotate8(key[k], 5 + buffer[i+5]%2);
            buffer[i+7] ^= leftRotate8(key[k], 6 + buffer[i+6]%2);
        }
    }
    return buffer;
}

function decrypt(data, keyString){    
    let key=[];
    if (typeof keyString==='string'){
        if (keyString.length!=64){
            throw "Invalid hex key length: "+keyString.length+". Needs to be 64.";
        }
        for (let i=0;i<keyString.length;i+=2){
            key[Math.floor(i/2)] = parseInt(keyString.substring(i, i+2), 16);
        }
    }else{
        if (keyString.length!=32){
            throw 'Invalid array key length:'+keyString.length+". Needs to be 32.";
        }
        key=keyString;
    }

    let buffer = new Uint8Array(data.length);
    buffer.set(data);

    for (let k=key.length-1;k>=0;k--){
        for (let i=data.length-8;i>=0;i-=1){
            buffer[i+7] ^= leftRotate8(key[k], 6 + buffer[i+6]%2);
            buffer[i+6] ^= leftRotate8(key[k], 5 + buffer[i+5]%2);
            buffer[i+5] ^= leftRotate8(key[k], 4 + buffer[i+4]%2);
            buffer[i+4] ^= leftRotate8(key[k], 3 + buffer[i+3]%2);
            buffer[i+3] ^= leftRotate8(key[k], 2 + buffer[i+2]%2);
            buffer[i+2] ^= leftRotate8(key[k], 1 + buffer[i+1]%2);
            buffer[i+1] ^= leftRotate8(key[k], 0 + buffer[i+0]%2);
            buffer[i+0] ^= key[k];

            buffer[i+7] ^= buffer[i+0];
            buffer[i+6] ^= buffer[i+7];
            buffer[i+5] ^= buffer[i+6];
            buffer[i+4] ^= buffer[i+5];
            buffer[i+3] ^= buffer[i+4];
            buffer[i+2] ^= buffer[i+3];
            buffer[i+1] ^= buffer[i+2];
            buffer[i+0] ^= buffer[i+1];
            
            let b4=rightRotate32(buffer[i+0] | buffer[i+2]<<8 | buffer[i+4]<<16 | buffer[i+6]<<24, key[k]%31);
            buffer[i+0] = b4 & 0xFF;
            buffer[i+2] = b4>>8 & 0xFF;
            buffer[i+4] = b4>>16 & 0xFF;
            buffer[i+6] = b4>>24 & 0xFF;

            b4=rightRotate32(buffer[i+1] | buffer[i+3]<<8 | buffer[i+5]<<16 | buffer[i+7]<<24, key[k]%31);
            buffer[i+1] = b4 & 0xFF;
            buffer[i+3] = b4>>8 & 0xFF;
            buffer[i+5] = b4>>16 & 0xFF;
            buffer[i+7] = b4>>24 & 0xFF;
        }
    }

    const len = buffer[0]<<8|buffer[1];
    return buffer.subarray(buffer.length-len);
}

module.exports={decrypt, encrypt};