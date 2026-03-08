// Роут продуктов
const express = require("express");
const productRouter = express.Router();

// Обработка конкретного продукта
productRouter.get("/:id", function(req, res){
  let productId = parseInt(req.params.id);
  let productInfo = res.locals.data.products.find(p => p.id === productId);

  if (!productInfo){
    res.status(404).render("not_found");
  };

  res.render("product", {
    product: productInfo
  });
});

// Обработка страницы всех
productRouter.get("/", function(req, res){
  res.render("products", {
    products: res.locals.data.products
  });
});

module.exports = productRouter;