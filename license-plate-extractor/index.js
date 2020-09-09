const axios = require('axios');
const sharp = require('sharp');
const stream = require('stream');
const storage = require('azure-storage');
const { default: Axios } = require('axios');
const blobService = storage.createBlobService();

module.exports = async function (context, myBlob) {
    context.log("JavaScript blob trigger function processed blob \n Blob:", context.bindingData.blobTrigger, "\n Blob Size:", myBlob.length, "Bytes");

    const imageUrl = context.bindingData.uri;
    const name = context.bindingData.name;

    const GLOBAL_WIDTH = 500;
    const GLOBAL_HEIGHT = 500;

    var predictedPlates;
    try{
        predictedPlates = await getLicensePlate(imageUrl);
        context.log("Prediction Sucessful "+ predictedPlates);

    }catch(err){
        context.log("Error while predicting Plates " + err);
        return;
    }

    const imageWidth = GLOBAL_WIDTH;
    const imageHeight = GLOBAL_HEIGHT;

    const predictedBox = predictedPlates.predictions[0].boundingBox;

    const width = parseInt(imageWidth * predictedBox.width);
    const height = parseInt(imageHeight * predictedBox.height);
    const left = parseInt(imageWidth * predictedBox.left);
    const top = parseInt(imageHeight * predictedBox.top);


    await sharp(myBlob).extract({
        width : width,
        height : height,
        left : left,
        top : top
    })
    .toBuffer()
    .then(buffer => {

        const readStream = stream.PassThrough();
        readStream.end(buffer);

        blobService.createBlockBlobFromStream(process.env.LICENSE_PLATE_CONTAINER, name, readStream, buffer.length, (err) => {
            if(err){
                context.log("Image updation Failed"+ err);
            }else{

                const url = "https://anprimages.blob.core.windows.net/vehicle-plates/"+name;

                const param = {
                    "url":url
                }

                axios.post('http://127.0.0.1:8080/api/v1.1/')
                    .then((response) => {
                        console.log(response);
                });

                axios.post('http://127.0.0.1:8080/api/v1.1/addOrUpdate',{
                    "url":url
                },{
                    headers : {
                        'Content-Type': 'application/json',
                    }
                }).then(response => {

                    console.log("OK:" + response);
                    context.done();
            
                }).catch(err =>{
                    reject("Error:" + err);
                    context.done();
                });
            }
        });

    }).catch(err =>{
        context.log("error " + err);
    });

};

function getLicensePlate(imageUrl){

    return new Promise((resolve,reject) => {
        axios.post(process.env.VISION_API_URL,{
            Url:imageUrl
        },{
            headers : {
                'Content-Type': 'application/json',
                "Prediction-Key" : process.env.KEY
            }
        }).then(response => {

            var res = response.data;
            res.predictions.sort(function(a,b){
                return b.probability - a.probability;
            });
            resolve(res);
    
        }).catch(err =>{
            reject(err);
        });
    });
 };