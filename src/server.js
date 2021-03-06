const express = require('express');
const path = require('path');
const rp = require('request-promise');
const fs = require('fs');
const request = require('request');
const MongoClient = require('mongodb').MongoClient;


const readXlsxFile = require('../node_modules/read-excel-file/node');
const multer = require('multer');
const UPLOAD_DESTINATION = __dirname + "/uploads/";
const OLD_TRAINING_PATH = __dirname + "/rasa/default_training.yml";
var upload = multer({
  dest: UPLOAD_DESTINATION
});

const app = express();
const port = process.env.port || 3001;

const PROJECTS_DB_URL = "mongodb://vca:Abc1234!@ds245132.mlab.com:45132/projects";
const PROJECTS_DB_NAME = "projects";
const PROJECTS_COLLECTION_NAME = "Projects";

var dbId = (1).toString(16)
var dbURL = "mongodb://vca:Abc1234!@ds135952.mlab.com:35952/nlu";
var dbName = "nlu";
var collectionName = "Intents";
var projectName = "current";
var modelName = "nlu2";
var description = "default project for the chatbot";

var defaultProject = {
  _id: {
    oid: dbId
  },
  projectName: projectName,
  modelName: modelName,
  dbURL: dbURL,
  dbName: dbName,
  collectionName: collectionName,
  description: description
}

var newProject = {
  projectName: null,
  modelName: null,
  dbURL: null,
  dbName: null,
  collectionName: null,
  description: null
};

var deleteID;


app.listen(port, () => {
  console.log("Starting initial training");
  //initialTrainingWithFile().then(() => {
  initialTrainingWithDatabase().then(() => {
    console.log("Server listenning on port " + port);
  }).catch(err => {
    console.error(err);
  });
});

app.get('/response/*', async (req, res) => {
  var paramArray = req.params[0].split('&');
  var message = paramArray[0];
  var flowValue = paramArray[1];
  var flowLenght = parseInt(paramArray[2]);
  var endOfFlow = {value: true};
  var response = {value: ""};
  
  await respond(flowValue, flowLenght, message, endOfFlow, response);
  res.send({
    response: response.value,
    endOfFlow: endOfFlow.value
  });
})

app.get('/flow/*', async (req, res) => {
  var message = req.params[0];
  console.log("Incoming message : " + message);
  var flow = {
    value: null
  };
  await getFlow(message, flow);
  res.send({
    flow: flow.value
  });
})

app.post('/uploadd/', upload.single('file'), async (req, res) => {
  var file = {};
  await readExcel(file, UPLOAD_DESTINATION + "/" + req.file.filename).then(async () => {
    await trainWithFile(file).then(response =>
      res.send(response));
  })
})

app.post('/upload/', upload.single('file'), async (req, res) => {
  var file = {};
  await readExcel(file, UPLOAD_DESTINATION + "/" + req.file.filename).then(() => {
    trainWithDatabase(file).then(response => {
      res.send(response);
    });
  }).catch(err => {
    console.error(err);
  })
})

async function respond(flowValue, flowLenght, message, endOfFlow, response){
  console.log("Incoming message : " + message);
  console.log("Incoming flow value : " + flowValue);
  console.log("Incoming flow length : " + flowLenght);

  if(flowValue === "*"){
    response.value = "*newProject: Add new project, *listProjects: list projects, *switchProject: switch current project ";
    response.value += "*getProject: get information about a project, *deleteProject: delete a project";
  }
  else if (flowValue === "*newProject") {
    switch (flowLenght) {
      case 1:
        response.value = "Project Name:";
        endOfFlow.value = false;
        break;
      case 2:
        newProject.projectName = message;
        console.log("Project name: " + newProject.projectName);
        response.value = "Model Name:"
        endOfFlow.value = false;
        break;
      case 3:
        newProject.modelName = message;
        console.log("Model name: " + newProject.modelName);
        response.value = "Database URL:";
        endOfFlow.value = false;
        break;
      case 4:
        newProject.dbURL = message.substring(0,8) + "/" + message.substring(8);
        console.log("Database URL: " + newProject.dbURL);
        response.value = "Database name:";
        endOfFlow.value = false;
        break;
      case 5:
        newProject.dbName = message;
        console.log("Database name: " + newProject.dbName);
        response.value = "Collection name:";
        endOfFlow.value = false;
        break;
      case 6:
        newProject.collectionName = message;
        console.log("Collection name: " + newProject.collectionName);
        response.value = "Description:";
        endOfFlow.value = false;
        break;
      case 7:
        newProject.description = message;
        console.log("Description: " + newProject.description);
        await insertProject(newProject).then(res => {
          switch(res.statusCode){
            case 0:
              response.value = "There was an error inserting new project - 0";
              break;
            case 1:
              response.value = "New project has been successfully added";
              break;
            case 2:
              response.value = "Another project already exists with the given data";
              break;
            default:
              response.value = "There was an error inserting new project - default6";
          }
          newProject = {
            projectName: null,
            modelName: null,
            dbURL: null,
            dbName: null,
            collectionName: null
          };
        }).catch(err => {
          console.error(err);
          response.value = "There was an error inserting new project - error";
        });
        break;
      default:
        response.value = "There was an error inserting new project - default";
    }
  }
  else if(flowValue === "*listProjects"){
    await listProjects().then(res => {
      response.value = res.value;
    })
  }
  else if(flowValue === "*switchProject"){
    switch(flowLenght){
      case 1:
        response.value = "Enter the id of the project you want to switch to";
        endOfFlow.value = false;
        break;
      case 2:
        await switchProject({oid: message}).then(res => {
          if (res.statusCode === 0){
            response.value = "There is no project with the given id";
          }
          else if(res.statusCode === 200){
            response.value = "Switched to the project " + message;
          }
          else{
            response.value = "Error switching project";
          }
        })
    }
  }
  else if(flowValue.substring(0, 14) === "*switchProject"){
    var id = message.substring(15);
    await switchProject({oid: id}).then(res => {
      if (res.statusCode === 0){
        response.value = "There is no project with the given id";
      }
      else if(res.statusCode === 200){
        response.value = "Switched to the project " + id;
      }
      else{
        response.value = "Error switching project";
      }
    })
  }
  else if(flowValue === "*getProject"){
    switch(flowLenght){
      case 1:
        response.value = "Which project would you like to get?";
        endOfFlow.value = false;
        break;
      case 2:
        await getProject({oid: message}).then(res => {
          if(res.statusCode === 0){
            response.value = "No project found with the given id";
          }
          else if(res.statusCode === 1){
            response.value = res.value;
          }
        }).catch(err => {
          console.error(err);
          response.value = "Error getting the project";
        })
    }
  }
  else if(flowValue.substring(0,11) === "*getProject"){
    await getProject({oid: message.substring(12)}).then(res => {
      if(res.statusCode === 0){
        response.value = "No project found with the given id";
      }
      else if(res.statusCode === 1){
        response.value = res.value;
      }
    }).catch(err => {
      console.error(err);
      response.value = "Error getting the project";
    })
  }
  else if(flowValue === "*deleteProject"){
    switch(flowLenght){
      case 1:
        response.value = "Which project would you like to delete?";
        endOfFlow.value = false;
        break;
      case 2:
        await getProject({oid: message}).then(res => {
          if(res.statusCode === 0){
            response.value = "No project found with the given id";
          }
          else if(res.statusCode === 1){
            deleteID = message;
            response.value = "Are you sure you want to delete the project: " + res.value + "  Press Y or N";
          }
        });
        endOfFlow.value = false;
        break;
      case 3:
        if(message.toUpperCase() === "Y"){
          await deleteProject({oid: deleteID}).then(res => {
            if(res.statusCode === 0){
              response.value = "No project found with the given id";
            }
            else if(res.statusCode === -1){
              response.value = "Error deleting the project - error";
            }
            else if(res.statusCode === 1){
              response.value = "Project deleted successfully";
            }
          }).catch(err => {
            console.error(err);
            response.value = "Error while deleting the project";
          })
        }
        else{
          response.value = "Project not deleted";
        }
        break;
      default:
        response.value = "Error while deleting the project - default";
    }
  }
  else if(flowValue.substring(0,14) === "*deleteProject"){
    switch(flowLenght){
        case 1:
          await getProject({oid: message.substring(15)}).then(res => {
            if(res.statusCode === 0){
              response.value = "No project found with the given id";
            }
            else if(res.statusCode === 1){
              deleteID = message.substring(15);
              response.value = "Are you sure you want to delete the project: " + res.value + "  Press Y or N";
            }
          });
          endOfFlow.value = false;
          break;
        case 2:
          if(message.toUpperCase() === "Y"){
            await deleteProject({oid: deleteID}).then(res => {
              if(res.statusCode === 0){
                response.value = "No project found with the given id";
              }
              else if(res.statusCode === -1){
                response.value = "Error deleting the project - error";
              }
              else if(res.statusCode === 1){
                response.value = "Project deleted successfully";
              }
            }).catch(err => {
              console.error(err);
              response.value = "Error while deleting the project";
            })
          }
          else{
            response.value = "Project not deleted";
          }
          break;
      default:
        response.value = "Error while deleting the project - default";
    }
  }
  else if (flowValue === "currency") {
    var currency = {
      eur: "",
      usd: "",
      code: 0
    };
    await getCurrency(currency);
    if (currency.code === 200) {
      response.value = "EUR/TL = " + currency.eur + " \n " +
        "USD/TL = " + currency.usd + " \n ";
    } else if (currency.code === 404) {
      response.value = "Error while getting the currency exchange rates";
    }
  } 
  else if (flowValue === "weather"){
    if( !(message !== "weather" && message.substring(0,7) === "weather")){
      switch (flowLenght) {
        case 1:
          response.value = "Which city would you like to know?";
          endOfFlow.value = false;
          break;
        case 2:
          var url = await getCityUrl(message);
          var weather = {
            city: message,
            code: 0
          };
          await getWeather(url, weather);
          if (weather.code === 200) {
            response.value = "Weather in " + weather.city + " is " + weather.main + " with " +
              weather.description + ". Temperature is " + weather.temp +
              "Celcius. " + "Humidity is " + weather.humidity + " % . " +
              "Pressure is " + weather.pressure + " bar";
          } else if (weather.code === 404) {
            response.value = "Error while getting the weather for " + message;
          }
      }
    }
    else if (message !== "weather" && message.substring(0,7) === "weather") {
      var city = message.substring(8);
      var url = await getCityUrl(city);
      var weather = {
        city: message,
        code: 0
      };
      await getWeather(url, weather);
      if (weather.code === 200) {
        response.value = "Weather in " + weather.city + " is " + weather.main + " with " +
          weather.description + ". Temperature is " + weather.temp +
          "Celcius. " + "Humidity is " + weather.humidity + " % . " +
          "Pressure is " + weather.pressure + " bar";
      } else if (weather.code === 404) {
        response.value = "Error while getting the weather for " + message;
      }
    }
  } 
  
  else if (flowValue === "affirm") {
    response.value = "Thanks";
  } 
  else if (flowValue === "greet") {
    response.value = "Hi";
  } 
  else if (flowValue === "thank") {
    response.value = "You are welcome";
  } 
  else if (flowValue === "smalltalk") {
    response.value = "I'm fine, thanks";
  } 
  else if (flowValue === "goodbye") {
    response.value = "goodbye"
  } 
  else if (flowValue === "frustration") {
    response.value = "I am sorry I couldn't be more helpful"
  } 
  else if (flowValue === "insult") {
    response.value = "That is not a nice thing to say";
  } 
  else if (flowValue !== null) {
    response.value = flowValue;
  } 
  else {
    response.value = "Cannot understand your message";
  }

  console.log("Determined response: " + response.value);
  console.log("End of flow: " + endOfFlow.value);
  console.log("************");
}

async function trainWithDatabase(file) {
  var res = {};
  console.log("Connecting to the database at " + dbURL);
  await MongoClient.connect(dbURL).then(async db => {
    var dbo = db.db(dbName);
    await new Promise((resolve, reject) => {
      dbo.collection(collectionName).insertMany(Object.values(file), function(err, res) {
        if (err) {
          reject(err);
        } else {
          console.log("New intents have been inserted to the database");
          resolve(dbo);
        }
      })
    }).then(async dbo => {
      var ret = {};
      await dbo.collection(collectionName).find({}, {
        projection: {
          _id: 0
        }
      }).toArray().then(result => {
        var fileContents = "language: \"en\" \n\n";
        fileContents = fileContents + "pipeline: \"spacy_sklearn\"\n\n";
        fileContents = fileContents + "data: {\n  \"rasa_nlu_data\": {\n    \"common_examples\": [\n";
        for (let i = 0; i < result.length; i++) {
          fileContents = fileContents + "      {\n        \"text\": \"" + result[i].text + "\",\n";
          fileContents = fileContents + "        \"intent\": \"" + result[i].intent + "\"\n      },\n";
        }
        fileContents = fileContents + "    ]\n   }\n}";
        fileContents = encode_utf8(fileContents);
        console.log("Training file ready");
        ret = {
          text: fileContents
        };
        return new Promise((resolve, reject) => {
          resolve(ret)
        });
      }).then(async s => {
        console.log("Making train request to localhost:5000");
        await trainNLU(s).then(response => {
          if (response.statusCode === 200) {
            console.log("SUCCESS TRAINING");
          } else {
            console.error("FAILED TRAINING");
          }
          res = {
            statusCode: response.statusCode
          };
        }).catch(err => {
          console.error(err);
        });
      })
    })
  }).catch(err => {
    console.error(err);
    reject(err);
  });
  return res;
}

async function initialTrainingWithDatabase() {
  var res = {};
  console.log("Connecting to the database at " + dbURL);
  await MongoClient.connect(dbURL).then(async function(db, err) {
    if (err) {
      console.error(err)
    };
    var dbo = db.db(dbName);
    var ret = {};
    await dbo.collection(collectionName).find({}, {
      projection: {
        _id: 0
      }
    }).toArray().then(result => {
      var fileContents = "language: \"en\" \n\n";
      fileContents = fileContents + "pipeline: \"spacy_sklearn\"\n\n";
      fileContents = fileContents + "data: {\n  \"rasa_nlu_data\": {\n    \"common_examples\": [\n";
      for (let i = 0; i < result.length; i++) {
        fileContents = fileContents + "      {\n        \"text\": \"" + result[i].text + "\",\n";
        fileContents = fileContents + "        \"intent\": \"" + result[i].intent + "\"\n      },\n";
      }
      fileContents = fileContents + "    ]\n   }\n}";
      fileContents = encode_utf8(fileContents);
      console.log("Initial training file ready");
      ret = {
        text: fileContents
      };
      return new Promise((resolve, reject) => {
        resolve(ret)
      });
    }).then(async s => {
      console.log("Making train request to localhost:5000");
      await trainNLU(s).then(response => {
        if (response.statusCode === 200) {
          console.log("SUCCESS INITIAL TRAINING");
          res.statusCode = 200;
        } 
        else {
          console.error("FAILED INITIAL TRAINING");
        }
      }).catch(err => {
        console.error(err);
      });
    }).catch(err => {
      console.error(err);
      reject(err);
    });
  });
  return res;
}

/**
 * Trains the nlu unit given the contents of the file
 * @param {*} file contents that the nlu will be trained with
 */
async function trainWithFile(file) {
  res = {};
  var fileContents = "language: \"en\" \n\n";
  fileContents = fileContents + "pipeline: \"spacy_sklearn\"\n\n";
  fileContents = fileContents + "data: {\n  \"rasa_nlu_data\": {\n    \"common_examples\": [\n";
  await new Promise((resolve, reject) => {
    fs.readFile(OLD_TRAINING_PATH, "utf8", (err, data) => {
      if (err) reject(err);
      else {
        resolve(data);
      }
    });
  }).then(data => {
    fileContents = fileContents + data;
    fileContents = encode_utf8(fileContents);
  }).then(() => {
    var length = Object.keys(file).length;
    for (i = 0; i < length; i++) {
      var newIntent = "      {\n  " + "        \"text\": \"" + file[i].text + "\",\n  " + "        \"intent\": \"" + file[i].intent + "\",\n  " + "        \"entities\": []\n        },\n  ";
      fileContents = fileContents + newIntent;
      fs.appendFile(OLD_TRAINING_PATH, newIntent, err => {
        if (err) console.error(err);
      });
    };
    fileContents = fileContents + "    ]\n   }\n}";
    fileContents = encode_utf8(fileContents);
    console.log("Training file ready");
    return {
      text: fileContents
    };
  }).then(async s => {
    console.log("Making train request to localhost:5000");
    await trainNLU(s).then(response => {
      if (response.statusCode === 200) {
        console.log("SUCCESS TRAINING");
      } else {
        console.error("FAILED TRAINING");
      }
      res = {
        statusCode: response.statusCode
      };
    }).catch(err => {
      console.error(err);
    });
  }).catch(err => {
    console.error(err);
    reject(err);
  });
  return res;
}

/**
 * Starts the initial training of the nlu each time chatbot has started
 */
async function initialTrainingWithFile() {
  var fileContents = "language: \"en\" \n\n";
  fileContents = fileContents + "pipeline: \"spacy_sklearn\"\n\n";
  fileContents = fileContents + "data: {\n  \"rasa_nlu_data\": {\n    \"common_examples\": [\n";
  new Promise((resolve, reject) => {
    fs.readFile(OLD_TRAINING_PATH, "utf8", (err, data) => {
      if (err) {
        reject(err);
      } 
      else {
        resolve(data);
      }
    });
  }).then(data => {
    fileContents = fileContents + data;
    fileContents = fileContents + "    ]\n   }\n}";
    fileContents = encode_utf8(fileContents);
    console.log("Initial training file ready");
    return {
      text: fileContents
    };
  }).then(async s => {
    console.log("Making train request to localhost:5000");
    await trainNLU(s).then(response => {
      if (response.statusCode === 200) {
        console.log("SUCCESS INITIAL TRAINING");
      } 
      else {
        console.error("FAILED INITIAL TRAINING");
      }
    }).catch(err => {
      console.error(err);
    });
  }).catch(err => {
    console.error(err);
    reject(err);
  });
}

async function insertProject(project) {
  var response = {};
  var query = {
    projectName: project.projectName,
    modelName: project.modelName,
    dbURL: project.dbURL,
    dbName: project.dbName,
    collectionName: project.collectionName
  }
  console.log("Connecting to " + PROJECTS_DB_URL);
  await MongoClient.connect(PROJECTS_DB_URL).then(async db => {
    var dbo = db.db(PROJECTS_DB_NAME);
    await dbo.collection(PROJECTS_COLLECTION_NAME).find(query).toArray().then(async result => {
      if(result.length !== 0){
        console.log("Duplicate identified");
        response.statusCode = 2;
      }
      else{
        await dbo.collection(PROJECTS_COLLECTION_NAME).find().count().then(async count => {
          var id = count + 1;
          project._id = {oid: id.toString(16)};
          await dbo.collection(PROJECTS_COLLECTION_NAME).insertOne(project).then((db, err) => {
            if(err){
              console.log("Error while inserting new project");
              response.statusCode = 0;
              console.error(err);
            }
            else{
              response.statusCode = 1;
              console.log("New project has been added to the database");
            }
          });
        });
      }
    });
  }).catch(err => {
    console.error(err);
  });
  return response;
}

async function listProjects(){
  var response = {};
  console.log("Connecting to " + PROJECTS_DB_URL);
  await MongoClient.connect(PROJECTS_DB_URL).then(async db => {
    var dbo = db.db(PROJECTS_DB_NAME);
    await dbo.collection(PROJECTS_COLLECTION_NAME).find().toArray().then(async result => {
      for(let i = 0; i < result.length; i++){
        if(i === 0)
          response.value = "id: " + result[i]._id.oid + ". ";
        else
          response.value += "id: " + result[i]._id.oid + ". ";
        response.value += "project name: " + result[i].projectName + ". ";
        response.value += "model name: " + result[i].modelName + ". ";
        response.value += "database url: " + result[i].dbURL + ". ";
        response.value += "database name: " + result[i].dbName + ". ";
        response.value += "collection name: " + result[i].collectionName + ". ";
        response.value += "description: " + result[i].description + ". ";
      }
    })
  })
  return response;
}

async function switchProject(id){
  var res = {};
  var query = {_id: id};
  console.log("Connecting to " + PROJECTS_DB_URL);
  await MongoClient.connect(PROJECTS_DB_URL).then(async db => {
    var dbo = db.db(PROJECTS_DB_NAME);
    await dbo.collection(PROJECTS_COLLECTION_NAME).find(query).toArray().then(async result => {
      if(result.length === 0){
        res.statusCode = 0;
      }
      else{
        dbId = id.oid;
        projectName = result[0].projectName;
        modelName = result[0].modelName;
        dbURL = result[0].dbURL;
        dbName = result[0].dbName;
        collectionName = result[0].collectionName;
        description = result[0].description;
        console.log("id: " + dbId);
        console.log("project name: " + projectName);
        console.log("model name: " + modelName);
        console.log("database url: " + dbURL);
        console.log("database name: " + dbName);
        console.log("collection name: " + collectionName);
        console.log("description: " + description);
        console.log("Starting the training for the project id: " + dbId);
        await initialTrainingWithDatabase().then(response => {
          res.statusCode = response.statusCode;
        });
      }
    })
  })
  return res;
}

async function getProject(id){
  var response = {};
  var query = {_id: id};
  console.log("Connecting to " + PROJECTS_DB_URL);
  await MongoClient.connect(PROJECTS_DB_URL).then(async db => {
    var dbo = db.db(PROJECTS_DB_NAME);
    await dbo.collection(PROJECTS_COLLECTION_NAME).find(query).toArray().then(async result => {
      if(result.length === 0){
        response.statusCode = 0;
      }
      else{
        response.statusCode = 1;
        response.value = "id: " + result[0]._id.oid + ". ";
        response.value += "project name: " + result[0].projectName + ". ";
        response.value += "model name: " + result[0].modelName + ". ";
        response.value += "database url: " + result[0].dbURL + ". ";
        response.value += "database name: " + result[0].dbName + ". ";
        response.value += "collection name: " + result[0].collectionName + ". ";
        response.value += "description: " + result[0].description + ". ";
      }
    })
  }).catch(err => {
    console.error(err);
  })
  return response;
}

async function deleteProject(id){
  var res = {};
  var query = {_id: id};
  console.log("Connecting to " + PROJECTS_DB_URL);
  await MongoClient.connect(PROJECTS_DB_URL).then(async db => {
    var dbo = db.db(PROJECTS_DB_NAME);
    await dbo.collection(PROJECTS_COLLECTION_NAME).find(query).toArray().then(async result => {
      if(result.length === 0){
        res.statusCode = 0;
      }
      else{
        await dbo.collection(PROJECTS_COLLECTION_NAME).deleteOne(query).then((db, err) => {
          if(err){
            console.error(err);
            res.statusCode = -1;
          }
          else{
            res.statusCode = 1;
            console.log("Document deleted");
          }
        })
      }
    })
  }).catch(err => {
    console.error(err);
  })
  return res;
}

/**
 * Makes the request that trains the nlu given the training file
 * @param {*} file file that holds the contents that the nlu will be trained
 */
async function trainNLU(file) {
  file.text = encode_utf8(file.text);
  var res = {};
  var options = {
    method: 'POST',
    url: 'http://localhost:5000/train?project=' + projectName + '&model=' + modelName,
    qs: {
      project: projectName
    },
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/x-yml'
    },
    body: file.text,
    resolveWithFullResponse: true
  };
  console.log("Awaiting response from localhost:5000/train");
  await rp(options).then(response => {
    //console.log(response.body);
    res = response;
    return response;
  }).catch(err => {
    console.error(err);
    console.error(file.text);
  })
  return res;
}

/**
 * Determines the flow of the given message
 * @param {*} message message of the user
 * @param {*} flow object to hold the determined flow
 */
async function getFlow(message, flow) {
  console.log("Determining the flow of the message");
  if(message.charAt(0) === "*"){
    flow.value = message;
  }
  else{
    await askNLU(message, flow);
  }
  console.log("Determined Flow : " + flow.value);
}

/**
 * Determines the url of the weather stats of the given city
 * @param {*} message message of the user which is expected to be a city
 */
function getCityUrl(message) {
  var city = message.charAt(0).toUpperCase() + message.slice(1);
  city = city.replace(/\s+/g, '');
  var url = 'http://api.openweathermap.org/data/2.5/weather?q=' + city +
    '&appid=' + 'd46ce5a0f44a100b614bde2f94a11c15';

  return url;
}

/**
 * Makes a request to the given url and holds the resulting weather stats in weather object
 * @param {*} url url to make the request
 * @param {*} weather object to hold the weather stats
 */
async function getWeather(url, weather) {
  console.log("Connecting to " + url + " to get the weather");
  await rp(url).then(body => {
    var b = JSON.parse(body);
    weather.code = 200;
    weather.main = b.weather[0].main;
    weather.description = b.weather[0].description;
    weather.temp = b.main.temp - 273.15;
    weather.humidity = b.main.humidity;
    weather.pressure = b.main.pressure;
  }).catch((err) => {
    weather.code = 404;
    console.error("Error getting the weather in the getWeather function in customActions.js")
    console.error(err);
  });
}

function getDateTime() {
  var date = new Date();
  var hour = date.getHours();
  hour = (hour < 10 ? "0" : "") + hour;
  var min = date.getMinutes();
  min = (min < 10 ? "0" : "") + min;
  var sec = date.getSeconds();
  sec = (sec < 10 ? "0" : "") + sec;
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  month = (month < 10 ? "0" : "") + month;
  var day = date.getDate();
  day = (day < 10 ? "0" : "") + day;
  return year + ":" + month + ":" + day + ":" + hour + ":" + min + ":" + sec;
}

function getDate() {
  var date = new Date();
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  month = (month < 10 ? "0" : "") + month;
  var day = date.getDate();
  day = (day < 10 ? "0" : "") + day;
  day = day - 1;
  return year + "-" + month + "-" + day;
}

/**
 * Determines the current currency rates making requests
 * @param {*} currency to hold the currency rates
 */
async function getCurrency(currency) {
  var url = "http://free.currencyconverterapi.com/api/v5/convert?q=EUR_TRY&compact=y";
  console.log("Connecting to " + url + " to get EUR exchange rates");
  await rp(url).then(body => {
    var b = JSON.parse(body);
    return b;
  }).then(b => {
    currency.code = 200;
    currency.eur = b.EUR_TRY.val;
    console.log("1 euro = " + currency.eur);
  }).catch(err => {
    currency.code = 404;
    console.error(err);
  });
  var url2 = "http://free.currencyconverterapi.com/api/v5/convert?q=USD_TRY&compact=y";
  console.log("Connecting to " + url2 + " to get USD exchange rates");
  await rp(url2).then(body => {
    var b = JSON.parse(body);
    return b;
  }).then(b => {
    currency.code = 200;
    currency.usd = b.USD_TRY.val;
    console.log("1 dollar = " + currency.usd);
  }).catch(err => {
    currency.code = 404;
    console.error(err);
  });
}

/**
 * Determines the flow of the given message asking NLU unit at port 5000 by making a POST request
 * @param {*} message input message
 * @param {*} flow object to hold the determined flow 
 */
async function askNLU(message, flow) {
  var dataString = "{\"q\": \"" + message + "\", \"project\": \"" + projectName + "\", \"model\": \"" + modelName + "\"}";

  console.log(dataString);
  var options = {
    url: 'http://localhost:5000/parse',
    method: 'POST',
    body: dataString,
    //resolveWithFullResponse: true
  };
  await rp(options).then(body => {
    var b = JSON.parse(body);
    //console.log(b);
    return b;
  }).then(b => {
    if (b.intent.confidence >= 0.15) {
      flow.value = b.intent.name;
    }
  }).catch(err => {
    console.error(err);
  });
}

/**
 * Reads an excel file in the .xlsx format. File's location is given in the function
 * Excel file is then transformed to an array of q/a objects
 * Excel file is assumed to have below format:
 * row1:    [file header]
 * row2:    [row of field names]
 * row3:    [rows of fields]
 * Example:
 *          faq
 *          questions | answers
 *          q1        | a1
 *          q2        | a2 
 * output: {0:{questions:q1, answers:a1}, {questions:q2, answers:a2}]
 * @param {*} file file to hold the resulting array of objects
 * @param {*} location path of the xlsx file
 */
async function readExcel(file, location) {
  await readXlsxFile(location).then((rows) => {
    var numOfFields = rows[1].length;
    for (let i = 0; i < rows.length - 2; i++) {
      file[i] = {};
    }
    for (let i = 2; i < rows.length; i++) {
      for (let j = 0; j < numOfFields; j++) {
        if (j == 0)
          file[i - 2]["text"] = rows[i][j];
        else
          file[i - 2]["intent"] = rows[i][j];
      }
    }
  }).catch(err => {
    console.error("Error reading excel file: " + err);
  })
}

function encode_utf8(s) {
  return unescape(encodeURIComponent(s));
}('\u4e0a\u6d77')

function readTextFile(file, s) {
  var rawFile = new XMLHttpRequest();
  rawFile.open("GET", file, false);
  rawFile.onreadystatechange = function() {
    if (rawFile.readyState === 4) {
      if (rawFile.status === 200 || rawFile.status == 0) {
        var allText = rawFile.responseText;
        s.text = allText;
      }
    }
  }
  rawFile.send(null);
}

function readFile(filePath, s) {
  fs.readFile(filePath, {
    encoding: 'utf-8'
  }, function(err, data) {
    if (!err) {
      console.log('Received data: ' + data);
      response.writeHead(200, {
        'Content-Type': 'text/html'
      });
      response.write(data);
      response.end();
    } 
    else {
      console.error(err);
    }
  });
}

