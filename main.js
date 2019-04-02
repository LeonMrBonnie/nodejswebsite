//Testseite Server in NodeJS
const appName = "Testseite";
const globalMaxFileSize = 5 * 1024 * 1024;
const globalAllowedTypes = ["jpg", "png", "jpeg"];

//Benötigte Packages
const mysql = require('mysql');
const http = require('http');
const express = require('express');
const path = require('path');
const app = express();
const port = 3000;
const sql = mysql.createConnection(
{
    host: "localhost",
    user: "root",                          //Datenbankeinstellungen
    password: "root",
    database: "test"
});
const exphbs = require("express-handlebars");
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bodyParser = require('body-parser');
const crypto = require("crypto");
const request = require("request");
const nodefiles = require("express-fileupload");
const fs = require("fs");

//Datenbankeinstellungen
var options = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    database: 'test'
};
var sessionStore = new MySQLStore(options);

let TotalViews;
let CurrentMOTD;
function SaveMain()
{
    sql.query("UPDATE `main` SET `TotalViews`=?",TotalViews);
    sql.query("SELECT COUNT(*) AS Result FROM `users`",(err, res, fld) =>
    {
        if(res.length == 0) return;
        sql.query("UPDATE `main` SET `TotalUsers`=?",res[0].Result);
    });
    sql.query("SELECT COUNT(*) AS Result FROM `articles`",(err, res, fld) =>
    {
        if(res.length == 0) return;
        sql.query("UPDATE `main` SET `TotalArticles`=?",res[0].Result);
    });
    console.log("Main saved.");
}
sql.connect(function(err) {
    if (err) throw err;
    sql.query("SELECT * FROM `main`", (err, ress, fld) =>
    {
        TotalViews = ress[0].TotalViews;
        CurrentMOTD = ress[0].MOTD;
        setInterval(SaveMain, 600000);
    });
    sql.query("UPDATE `users` SET DenyArticle=0 WHERE DenyArticle=1");
    sql.query("UPDATE `users` SET DenyArticleComment=0 WHERE DenyArticleComment=1");
});

app.use((req, res, next) => 
{
    res.append('Access-Control-Allow-Origin', ['*']);
    res.append('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.append('Access-Control-Allow-Headers', 'Content-Type');
    next();
});
app.use(express.static("css"));
app.use(express.static("js"));
app.use(express.static("views"));
app.use(express.static("fonts"));
app.use(express.static("data"));
app.use(express.static("uploads"));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(session({
    secret: '_SLgw+8o~sM6a*we`/y5Ag_9q0UgZV=;mW:`Zl)7K]ouxkub1z5?E:<|pQUmjy*',
    resave: true,
    store: sessionStore,
    saveUninitialized: false,
    cookie: 
    {
        expires: 86400000,
        maxAge: 86400000
    }
}));

app.engine("handlebars", exphbs({ defaultLayout: "main", layoutsDir: __dirname + "/views/layouts/" }));
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));
app.use(nodefiles({
    useTempFiles : true,
    tempFileDir : __dirname + '/uploads/tmp/',
    createParentPath: true
}));

function getGlobalPageName(URL)
{
    let pageName = "Unknown";
    let file = fs.readFileSync("data/pages.json");
    let pages = JSON.parse(file);
    if(URL.slice(-1) === "/") URL = URL.slice(0, -1);
    if(pages[URL] !== undefined) pageName = pages[URL];
    return appName + " | " + pageName;
}

function getUserAvatar(userid)
{
    let file;
    for(let i = 0; i < globalAllowedTypes.length; i++) 
    {
        let curFile = "uploads/useravatar/" + "avatar_" + userid + "." + globalAllowedTypes[i];
        if(fs.existsSync(curFile))
        {
            file = "/useravatar/" + "avatar_" + userid + "." + globalAllowedTypes[i];
            return file;
        }
        else continue;
    }
    return false;
}

app.use((req, res, next) =>
{
    if(req.session.admin == 1) res.locals.globaladmin = 1;
    if(req.session.name) res.locals.globalusername = req.session.name;
    res.locals.globalpagename = getGlobalPageName(req.path);
    next();
});

app.get("/", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    if(req.query.logout) return res.render("home", {logout: 1, motd: CurrentMOTD});
    if(req.query.login) return res.render("home", {login: 1, motd: CurrentMOTD});
    res.render("home", {motd: CurrentMOTD});
});

app.get("/pages", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    if(req.session.admin == 0) return res.render("denied", {deny: "You are not an administrator."});
    let file = fs.readFileSync("data/pages.json");
    let pages = JSON.parse(file);
    let arr = [];
    for(var attr in pages)
    {
        arr.push({pageurl: attr, pagename: pages[attr]});
    }
    let data =
    {
        page: arr
    };
    res.render("pages", data);
});

app.post("/pages", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    if(req.session.admin == 0) return res.render("denied", {deny: "You are not an administrator."});
    if(req.body.delete)
    {
        let del = req.body.delete;
        console.log(del);
        let file = fs.readFileSync("data/pages.json");
        let pages = JSON.parse(file);
        if(pages[del] === undefined) return res.render("pages", {error: "The specified page does not exist.", name: req.body.name, url: req.body.url});
        delete pages.del;
        fs.writeFile("data/pages.json", JSON.stringify(pages, undefined, 2), (err) =>
        {
            if(err) throw err;
            else return res.render("pages", {delete: del, name: req.body.name, url: req.body.url})
        });
    }
    else
    {
        if(req.body.name === undefined || req.body.url === undefined) return res.render("pages", {error: "You have to specify an URL and a name for the page."});
        if(req.body.name.length < 4 || req.body.url.length < 4) return res.render("pages", {error: "The URL and the page name have to be longer than 4 characters.", name: req.body.name, url: req.body.url});
        if(req.body.name.length > 64 || req.body.url.length > 64) return res.render("pages", {error: "The URL and the page name cannot be longer than 64 characters.", name: req.body.name, url: req.body.url});
        let file = fs.readFileSync("data/pages.json");
        let pages = JSON.parse(file);
        pages[req.body.url] = req.body.name;
        fs.writeFile("data/pages.json", JSON.stringify(pages, undefined, 2), (err) =>
        {
            if(err) throw err;
            else return res.render("pages", {success: 1, name: req.body.name, url: req.body.url})
        });
    }
});

app.get("/avatar", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    let avatar = getUserAvatar(req.session.userid);
    if(!avatar) return res.render("upload");
    else return res.render("upload", {avatar: avatar});
});

app.post("/avatar", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    let file = req.files.uploadedFile;
    if(!req.files || !file) return res.render("upload", {error: "You have to upload a file."});
    let tempType = file.name.split(".");
    let fileType = tempType[1];
    let fileName = "avatar_" + req.session.userid;
    let allowed = false;
    for(let i = 0; i < globalAllowedTypes.length; i++) 
    {
        if(fileType === globalAllowedTypes[i])
        {
            allowed = true;
            break;
        }
    }
    if(!allowed) return res.render("upload", {error: "The file has to be an image file."});
    if(file.size > globalMaxFileSize) return res.render("upload", {error: "The file cannot be bigger than " + globalMaxFileSize + " Bytes."});
    if(getUserAvatar(req.session.userid) !== false) fs.unlinkSync(__dirname + "/uploads" + getUserAvatar(req.session.userid));
    file.mv(__dirname + '/uploads/useravatar/' + fileName + "." + fileType, (err) => 
    {
        if(err) return res.render("upload", {error: err});
        else return res.render("upload", {success: "Your avatar was successfully uploaded.", avatar: "/useravatar/" + fileName + "." + fileType});
    });
});

app.get("/acp", (req, res, next) =>
{
    if(!req.session.userid) return res.redirect("/login");
    if(req.session.admin == 0) return res.render("denied", {deny: "You are not an administrator."});
    res.render("acp", {username: req.session.name, motd: CurrentMOTD});
});

app.post("/acp", (req, res, next) =>
{
    let motd = req.body.setmotd;
    if(motd.length < 4) return res.render("acp", {username: req.session.name, motd: motd, error: "The MOTD has to be atleast 4 characters long."});
    if(motd.length > 255) return res.render("acp", {username: req.session.name, motd: motd, error: "The entered MOTD is too long."});
    if(motd == CurrentMOTD) return res.render("acp", {username: req.session.name, motd: motd, error: "The entered MOTD is the same as before."});
    sql.query("UPDATE `main` SET `MOTD`=?", motd, (err, result, fld) =>
    {
        CurrentMOTD = motd;
        return res.render("acp", {username: req.session.name, motd: motd, success: "The MOTD was successfully changed."});
    });
});

app.get("/usersearch", (req, res, next) => 
{
    let query = req.query.query;
    if(!req.session.userid) return res.redirect("/login");
    if(req.session.admin == 0) return res.render("denied", {deny: "You are not an administrator."});
    if(req.query === null || req.query === undefined) return res.render("usersearch");
    if(query === null || query === undefined) return res.render("usersearch");
    if(query.length == 0) return res.render("usersearch", {error: "The query cannot be empty."});
    if(query.length < 4) return res.render("usersearch", {error: "The query has to be atleast 4 characters long."});
    sql.query("SELECT * FROM `users` WHERE `Name` LIKE ?", "%" + query + "%", (err, result, fields) =>
    {
        if(err) throw err;
        if(result.length == 0) return res.render("usersearch", {error: "The query returned nothing.", Query: query});
        let arr = [];
        Object.keys(result).forEach(function(key) 
        {
            let row = result[key];
            arr.push({ID: row.ID, Name: row.Name});
        });
        let data = 
        {
            items: arr,
            Query: query
        }
        res.render("usersearch", data);
    });
});

app.post("/usersearch", (req, res) =>
{
    if(req.body.makeadmin)
    {
        let makeadmin = req.body.makeadmin;
        sql.query("SELECT * FROM `users` WHERE `ID` = ?", makeadmin, (err, result, fields) =>
        {
            if(result.length == 0) return res.render("usersearch", {error: "A database error occured. Please try again."});
            let name = result[0].Name;
            let admin = result[0].Admin;
            let newadmin;
            if(admin == 0) newadmin = 1;
            else newadmin = 0;
            sql.query("UPDATE `users` SET `Admin`=? WHERE `ID`=?", [newadmin, makeadmin], (err, result, fields) =>
            {
                if(newadmin == 0) return res.render("usersearch", {Query: req.body.query, msg: "Successfully revoked admin from " + name + " [ID: " + makeadmin + "]"});
                else return res.render("usersearch", {Query: req.body.query, msg: "Successfully granted admin to " + name + " [ID: " + makeadmin + "]"});
            });
        });
    }
    else
    {
        if(req.body.deleteuser)
        {
            sql.query("DELETE FROM `users` WHERE `ID`=?", req.body.deleteuser, (err, result, fields) =>
            {
                if(result.affectedRows == 0) return res.render("usersearch", {error: "A database error occured. Please try again."});
                else return res.render("usersearch", {Query: req.body.query, msg: "Successfuly deleted the user with the id " + req.body.deleteuser});
            });
        }
    }
});

app.get("/login", (req, res) =>
{            
    if(req.session.userid) return res.redirect("/");
    else return res.render("login", {layout: "custom"});
});

app.post("/login", (req, res) =>
{
    if(req.body.username === undefined || req.body.username === null) return res.render("login", {layout: "custom"});
    const hash = crypto.createHash("sha256");
    hash.update(req.body.password);
    let password = hash.digest("hex");
    if(req.body.username.length == 0 || req.body.password.length == 0) return res.render("login", {layout: "custom", error: "The name or password cannot be empty.", username: req.body.name, password: req.body.password});
    sql.query('SELECT * FROM `users` WHERE `Name` = ? AND BINARY `Password` = ?', [req.body.username, password], (error, result, fields) => 
    {
        if(error) throw error;
        if(result.length == 0) return res.render("login", {layout: "custom", error: "The account does not exist or the wrong password was specified.", username: req.body.username, password: req.body.password});
        sql.query("SELECT * FROM `bans` WHERE `userid` = ?", [result[0].ID], (err, ress, fld) =>
        {
            if(ress.length != 0) return res.render("login", {layout: "custom", error: "The account is banned. <br> Banned by: <strong>" + ress[0].banadmin + "</strong><br> Reason: <strong>" + ress[0].banreason +  " </strong><br>Banned on: <strong>" + ress[0].bandate + "</strong>", username: req.body.username, password: req.body.password});
            let ses = req.session;
            ses.userid = result[0].ID;
            ses.admin = result[0].Admin;
            ses.email = result[0].Email;
            ses.name = result[0].Name;
            ses.denyarticle = result[0].DenyArticle;
            ses.denyarticlecomment = result[0].DenyArticleComment;
            res.redirect("/?login=1");
        });
    });
});

app.get("/register", (req, res) =>
{
    if(req.session.userid) return res.redirect("/");
    else return res.render("register", {layout: "custom"});
});

app.post("/register", (req, res) =>
{
    if(req.body.name === undefined || req.body.name === null) return res.render("register");
    if(req.body.name.length == 0 || req.body.password.length == 0 || req.body.email.length == 0) return res.render("register", {layout: "custom", error: "The name, password or email cannot be empty.", name: req.body.name, password: req.body.password, email: req.body.email});
    if(req.body.password.length < 4) return res.render("register", {layout: "custom", error: "The password has to be atleast 4 characters long.", name: req.body.name, password: req.body.password, email: req.body.email});
    if(req.body.name.length < 4) return res.render("register", {layout: "custom", error: "The name has to be atleast 4 characters long.", name: req.body.name, password: req.body.password, email: req.body.email});
    if(req.body.email.length < 6) return res.render("register", {layout: "custom", error: "The email has to be atleast 6 characters long.", name: req.body.name, password: req.body.password, email: req.body.email});
    if(req.body.password.length > 64) return res.render("register", {layout: "custom", error: "The password has to be max 64 characters long.", name: req.body.name, password: req.body.password, email: req.body.email});
    if(req.body.name.length > 32) return res.render("register", {layout: "custom", error: "The name has to be max 32 characters long.", name: req.body.name, password: req.body.password, email: req.body.email});
    if(req.body.email.length > 64) return res.render("register", {layout: "custom", error: "The email has to be max 64 characters long.", name: req.body.name, password: req.body.password, email: req.body.email});
    sql.query("SELECT * FROM `users` WHERE `Name` = ?", req.body.name, (error, result, fields) =>
    {
        if(result.length != 0) return res.render("register", {layout: "custom", error: "An account with this name already exists.",name: req.body.name, password: req.body.password, email: req.body.email});
        let today = new Date();
        const hash = crypto.createHash("sha256");
        hash.update(req.body.password);
        let password = hash.digest("hex");
        sql.query('INSERT INTO `users` (Name, Password, Email, Created) VALUES (?, ?, ?, ?)', [req.body.name, password, req.body.email, today], (error, result, fields) => 
        {
            if(error) throw error;
            res.redirect("/login", {register: 1});
        });
    });
});

app.get("/viewaccount", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    let id;
    if(!req.query.id) id = req.session.userid;
    else id = req.query.id;
    sql.query("SELECT * FROM `users` WHERE `ID` = ?", id, (err, ress, fld) =>
    {
        if(ress.length == 0) return res.render("denied", {deny: "There was no account found with the given id."});
        let avatar = getUserAvatar(id);
        if(!avatar)
        {
            if(id == req.session.userid) return res.render("viewaccount", {id: ress[0].ID, name: ress[0].Name, email: ress[0].Email, admin: ress[0].Admin});
            else return res.render("viewaccount", {id: ress[0].ID, name: ress[0].Name, admin: ress[0].Admin, notself: 1});
        }
        else
        {
            if(id == req.session.userid) return res.render("viewaccount", {avatar: avatar, id: ress[0].ID, name: ress[0].Name, email: ress[0].Email, admin: ress[0].Admin});
            else return res.render("viewaccount", {avatar: avatar, id: ress[0].ID, name: ress[0].Name, admin: ress[0].Admin, notself: 1});
        }
    });
});  

app.post("/viewaccount", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    if(req.body.logout)
    {
        req.session.destroy();
        res.redirect("/login?logout=1");
    }
});

app.get("/edituser", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    if(req.session.admin == 0) return res.render("denied", {deny: "You are not an administrator."});
    if(!req.query.id) return res.render("edituser", {error: "You have to specify a user id."});
    sql.query("SELECT * FROM `users` WHERE `ID` = ?", req.query.id, (err, ress, fld) =>
    {
        if(ress.length == 0) return res.render("edituser", {error: "No user exists with the given id."});
        res.render("edituser", {id: ress[0].ID, name: ress[0].Name, email: ress[0].Email, admin: ress[0].Admin});
    });
});

app.get("/articles", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    if(req.query.delete)
    {
    sql.query("DELETE FROM `articles` WHERE `ID` = ?", req.query.delete, (err, ress) =>
    {
    if(ress.affectedRows == 0) return res.render("articles", {delete: 1, deleteerror: "No article exists with the given id."});
    else return res.render("articles", {delete: 1, deleteid: req.query.delete});
    });
    }
    else
    {
    let page;
    if(req.query.page) page = req.query.page
    else page = 1;
    sql.query("SELECT * FROM `articles` ORDER BY `ID` DESC LIMIT ?, 10", page * 10 - 10, (err, ress, fld) =>
    {
        if(ress.length == 0 && page == 1) return res.render("articles", {error: "There are no news articles published.", Page: page});
        else if(ress.length == 0) return res.render("articles", {msg: "There are no news to display on this page.", Page: page});
        let arr = [];
        Object.keys(ress).forEach(function(key) 
        {
            let row = ress[key];
            arr.push({ID: row.ID, Title: row.Title, Author: row.Author, Date: row.Date});
        });
        let data;
        if(req.session.admin == 1)
        {
            data = 
            {
                items: arr,
                Page: page,
                Admin: 1
            }
        }
        else
        {
            data = 
            {
                items: arr,
                Page: page
            }
        }
        res.render("articles", data);
    });
    }
});

app.get("/createarticle", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    if(req.session.admin == 0) return res.render("denied", {deny: "You are not an administrator."});
    if(req.session.denyarticle == 1)
    {
        sql.query("SELECT * FROM `users` WHERE ID = ?", req.session.userid, (err, ress, fld) =>
        {
            if(ress[0].DenyArticle == 1) return res.render("denied", {deny: "You can only create an article every 5 minutes."});
            req.session.denyarticle = 0;
            res.render("createarticle");
        });
    }
    else res.render("createarticle");
});

app.post("/createarticle", (req, res) =>
{
    if(req.session.denyarticle == 1)
    {
        sql.query("SELECT * FROM `users` WHERE ID = ?", req.session.userid, (err, ress, fld) =>
        {
            if(ress[0].DenyArticle == 1) return res.render("denied", {deny: "You can only create an article every 5 minutes."});
            else req.session.denyarticle = 0;
        });
    }
    else
    {
        if(req.body.title === undefined && req.body.text === undefined) return res.render("createarticle");
        if(!req.body.title) return res.render("createarticle", {error: "You have to give your article a title.", text: req.body.text});
        if(req.body.title.length < 4) return res.render("createarticle", {error: "The title has to be atleast 4 characters long.", text: req.body.text, title: req.body.title});
        if(!req.body.text) return res.render("createarticle", {error: "You have to give your article a text.", title: req.body.title});
        if(req.body.text.length < 4) return res.render("createarticle", {error: "The text has to be atleast 4 characters long.", text: req.body.text, title: req.body.title});

        let date = timeConverter(Date.now());
        sql.query("INSERT INTO `articles` (Title, Text, Author, AuthorID, Date) VALUES(?, ?, ?, ?, ?)", [req.body.title, req.body.text, req.session.name, req.session.userid, date], (err, ress) =>
        {
            res.render("createarticle", {id: ress.insertId, success: 1});
            sql.query("UPDATE `users` SET `DenyArticle`=1 WHERE `ID`=?", req.session.userid);
            req.session.denyarticle = 1;
        });
    }
});

app.get("/viewarticle", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    if(!req.query.id) return res.render("viewarticle", {error: "You have to specify an articleid."});
    sql.query("SELECT * FROM `articles` WHERE `ID` = ?", req.query.id, (err, ress, fld) =>
    {
        if(ress.length == 0) return res.render("viewarticle", {error: "There was no article found with the given id."});
        res.render("viewarticle", {id: req.query.id, title: ress[0].Title, author: ress[0].Author, authorid: ress[0].AuthorID, date: ress[0].Date, text: ress[0].Text});
    });
});

app.post("/viewarticle", (req, res) =>
{
    if(req.session.denyarticlecomment == 1)
    {
        sql.query("SELECT * FROM `users` WHERE ID = ?", req.session.userid, (err, ress, fld) =>
        {
            if(ress[0].DenyArticleComment == 1) return res.render("viewarticle", {comment: req.body.comment, id: req.body.id, title: ress[0].Title, author: ress[0].Author, authorid: ress[0].AuthorID, date: ress[0].Date, text: ress[0].Text, msg: "You can only post an comment every 5 minutes."});
            else
            {
                req.session.denyarticlecomment = 0;
                sql.query("SELECT * FROM `articles` WHERE `ID` = ?", req.body.id, (err, result, fld) =>
                {
                    if(result.length == 0) return res.render("viewarticle", {error: "There was no article found with the given id."});
                    let com = req.body.comment;
                    if(!com) return res.render("viewarticle", {id: req.body.id, title: result[0].Title, author: result[0].Author, authorid: result[0].AuthorID, date: result[0].Date, text: result[0].Text, msg: "The comment cannot be empty."});
                    if(com.length > 1023) return res.render("viewarticle", {comment: com, id: req.body.id, title: result[0].Title, author: result[0].Author, authorid: result[0].AuthorID, date: result[0].Date, text: result[0].Text, msg: "The comment cannot be longer than 1023 characters."});
                    if(com.length < 4) return res.render("viewarticle", {comment: com, id: req.body.id, title: result[0].Title, author: result[0].Author, authorid: result[0].AuthorID, date: result[0].Date, text: result[0].Text, msg: "The comment cannot be shorter than 4 characters."});
                    let date = timeConverter(Date.now());
                    sql.query("INSERT INTO `articlecomments` (ArticleID, Author, AuthorID, Comment, Date) VALUES(?, ?, ?, ?, ?)", [req.body.id, req.session.name, req.session.userid, com, date], (err, result2, fld) =>
                    {
                        if(err) throw err;
                        sql.query("UPDATE `users` SET `DenyArticleComment`=1 WHERE `ID`=?", req.session.userid);
                        req.session.denyarticlecomment = 1;
                        return res.render("viewarticle", {id: req.body.id, title: result[0].Title, author: result[0].Author, authorid: result[0].AuthorID, date: result[0].Date, text: result[0].Text, success: "Your comment was succesfully posted."});
                    });
                });
            }
        });
    }
    else
    {
        sql.query("SELECT * FROM `articles` WHERE `ID` = ?", req.body.id, (err, result, fld) =>
        {
            if(result.length == 0) return res.render("viewarticle", {error: "There was no article found with the given id."});
            let com = req.body.comment;
            if(!com) return res.render("viewarticle", {id: req.body.id, title: result[0].Title, author: result[0].Author, authorid: result[0].AuthorID, date: result[0].Date, text: result[0].Text, msg: "The comment cannot be empty."});
            if(com.length > 1023) return res.render("viewarticle", {comment: com, id: req.body.id, title: result[0].Title, author: result[0].Author, authorid: result[0].AuthorID, date: result[0].Date, text: result[0].Text, msg: "The comment cannot be longer than 1023 characters."});
            if(com.length < 4) return res.render("viewarticle", {comment: com, id: req.body.id, title: result[0].Title, author: result[0].Author, authorid: result[0].AuthorID, date: result[0].Date, text: result[0].Text, msg: "The comment cannot be shorter than 4 characters."});
            let date = timeConverter(Date.now());
            sql.query("INSERT INTO `articlecomments` (ArticleID, Author, AuthorID, Comment, Date) VALUES(?, ?, ?, ?, ?)", [req.body.id, req.session.name, req.session.userid, com, date], (err, result2, fld) =>
            {
                if(err) throw err;
                sql.query("UPDATE `users` SET `DenyArticleComment`=1 WHERE `ID`=?", req.session.userid);
                req.session.denyarticlecomment = 1;
                return res.render("viewarticle", {id: req.body.id, title: result[0].Title, author: result[0].Author, authorid: result[0].AuthorID, date: result[0].Date, text: result[0].Text, success: "Your comment was succesfully posted."});
            });
        });
    }
});

app.get("/editarticle", (req, res) =>
{
    if(!req.session.userid) return res.redirect("/login");
    if(req.session.admin == 0) return res.render("denied", {deny: "You are not an administrator."});
    if(!req.query.id) return res.render("editarticle", {error: "You have to specify an articleid."});
    sql.query("SELECT * FROM `articles` WHERE `ID`=?",req.query.id,(err, ress, fld) =>
    {
        if(ress.length == 0) return res.render("editarticle", {error: "There was no article found with the given id."});
        res.render("editarticle", {title: ress[0].Title, text: ress[0].Text, id: req.body.id});
    });
});

app.post("/editarticle", (req, res) =>
{
    if(!req.body.id) return res.render("editarticle", {error: "You have to specify an articleid."});
    sql.query("SELECT * FROM `articles` WHERE `ID`=?",req.body.id,(err, ress, fld) =>
    {
        if(ress.length == 0) return res.render("editarticle", {error: "There was no article found with the given id."});
        if(!req.body.title) return res.render("editarticle", {error: "You have to give the article a title.", text: req.body.text, id: req.body.id});
        if(req.body.title.length < 4) return res.render("editarticle", {error: "The title has to be atleast 4 characters long.", id: req.body.id, text: req.body.text, title: req.body.title});
        if(!req.body.text) return res.render("editarticle", {error: "You have to give the article a text.", id: req.body.id, title: req.body.title});
        if(req.body.text.length < 4) return res.render("editarticle", {error: "The text has to be atleast 4 characters long.", id: req.body.id, text: req.body.text, title: req.body.title});
        sql.query("UPDATE `articles` SET `Title`=?,`Text`=? WHERE `ID`=?", [req.body.title,req.body.text,req.body.id], (err, ress, fld) =>
        {
            if(err) throw err;
             return res.render("editarticle", {success: "The article with the id " + req.body.id + " was successfully edited."});
        });
    });
});

app.get("/404", (req, res) =>
{
    res.status(404);
    return res.render("404", {layout: "custom"});
});

app.use((req, res, next) =>
{
    res.status(404);
    res.redirect("/404");
});

function timeConverter(UNIX_timestamp)
{
    var a = new Date(UNIX_timestamp);
    var year = a.getFullYear();
    var month = a.getMonth() + 1;
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes() < 10 ? '0' + a.getMinutes() : a.getMinutes();
    var time = date + '.' + month + '.' + year + ' ' + hour + ':' + min;
    return time;
}
app.listen(port);
console.log("Der Hauptserver wurde erfolgreich gestartet!");