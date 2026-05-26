// Роут продуктов
const express = require("express");
const productRouter = express.Router();
const productsController = require("../../controllers/products_controller");

// Обработка конкретного продукта
productRouter.get("/:id", productsController.showProductPage);

// Обработка страницы всех товаров
productRouter.get("/", productsController.showProductsPage);

productRouter.post('/:id/subscribe', productsController.subscribeToProduct);
productRouter.put('/:id/price', productsController.updateProductPrice);

module.exports = productRouter;