// роутер выхода
const express = require("express");
const logoutRouter = express.Router();

logoutRouter.post("/", function(req, res){
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Ошибка выхода" });
        }
        res.clearCookie("connect.sid");
        res.json({ success: true, message: "Выход выполнен" });
    });
});

module.exports = logoutRouter;