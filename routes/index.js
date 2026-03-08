const express = require("express");
const indexRouter = express.Router();

indexRouter.use("/", function (req, res){
  res.render("index");
});

module.exports = indexRouter;