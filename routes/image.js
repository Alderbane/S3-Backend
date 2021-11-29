const router = require('express').Router();
const aws = require('aws-sdk');
const multer = require('multer');
const fs = require('fs-extra');
const {
    v4: uuidv4
} = require('uuid');
const fetch = require('node-fetch');
// const http = require('http');


const url = "http://photoalbumapi-env.eba-z3bpuujp.us-east-1.elasticbeanstalk.com/image"

// S3 //
const s3 = new aws.S3({
    accessKeyId: process.env.aws_access_key_id,
    secretAccessKey: process.env.aws_secret_access_key,
    sessionToken: process.env.aws_session_token
});

// MULTER //
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './temp/images/');
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    },
})
const upload = multer({
    storage: storage
});


///// ROUTES /////
// Deletes the specified picture. Requires 'mediaId' and 'userId' in body params
router.delete('/', async function (req, res) {
    console.log(req.body);
    const userId = req.body.userId;
    const mediaId = req.body.mediaId;
    let response = await fetch(url, {
        method: 'DELETE',
        body: JSON.stringify(req.body),
        headers: {
            'Content-Type': 'application/json'
            // 'Content-Type': 'application/x-www-form-urlencoded',
        },
    })
    // test(req.body);
    if (response.status != 200) {
        res.status(response.status).send(`Error: ${response.status==500?"Could not reach or delete image at this moment":"Error: The image does not exist or it is not owned by the specified user"}`)
        return;
    }
    getImageResult = await response.json();
    console.log(getImageResult);

    // Delete from S3
    const image = getImageResult;
    const extension = image.Url.substring(image.Url.lastIndexOf('.'));
    const params = {
        Bucket: process.env.bucket,
        Key: mediaId + extension
    };
    let deleteMediaResult;
    try {
        deleteMediaResult = s3.deleteObject(params).promise();
        console.log(deleteMediaResult);
    } catch (error) {
        res.status(500).send('Error: could not delete image from AWS S3 at the moment');
        console.log(error);
        return;
    }

    // TODO: Delete from Thumbnail bucket

    res.status(200).send('Image deleted successfully');
});

router.put('/', function (req, res) {
    // TODO: update in MySQL as well
    var OLD_KEY = req.body.name;
    var NEW_KEY = req.body.newName;
    var newparams = {
        Bucket: process.env.bucket,
        CopySource: `${process.env.bucket}/${OLD_KEY}`,
        Key: NEW_KEY
    };
    var oldparams = {
        Bucket: process.env.bucket,
        Key: OLD_KEY
    };
    s3.copyObject(newparams, function (err, data) {
        s3.deleteObject(oldparams, function (er, dat) {
            if (er) throw er;
        });
        if (err) throw err;
        res.send(data);
    })
})

router.post('/', upload.single('file'), async function (req, res) {
    const name = req.body.name;
    if (!req.body.userId || !req.body.folderId || !req.body.name) {
        res.status(400).send(`Error: Missing parameters: ${!req.body.userId?"\nuserId":""} ${!req.body.folderId?"\nfolderId":""} ${!req.body.name?"\nname":""}`)
    }

    let tags;
    try {
        tags = JSON.parse(req.body.tags);
    } catch (error) {
        res.status(400).send('Error: tags field could not be parsed as JSON');
    }

    // UPLOAD IMAGE TO S3
    const fileContent = fs.readFileSync(req.file.path);
    const mediaId = uuidv4();
    const imgExtension = name.substring(name.lastIndexOf('.'));
    const params = {
        Bucket: process.env.bucket,
        Key: mediaId + imgExtension,
        Body: fileContent,
        ACL: 'public-read' // give public access to the image
    };

    let uploadImageResult;
    try {
        uploadImageResult = await s3.upload(params).promise();
    } catch (error) {
        res.status(500).send('Error: could not upload image to AWS S3');
        console.log(error);
        fs.remove(req.file.path);
        return;
    }

    // Remove temp copy we created in server
    fs.remove(req.file.path);

    req.body.url = uploadImageResult.Location;
    req.body.mediaId = mediaId;

    let response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(req.body),
        headers: {
            'Content-Type': 'application/json'
            // 'Content-Type': 'application/x-www-form-urlencoded',
        },
    })
    // UPDATE MYSQL DB
    // Media table
    if (response.status == 200) {
        res.status(200).send('Image created (tags are currently ignored)')
    } else {
        res.status(400).send(await response.text())
    }

});

module.exports = router;