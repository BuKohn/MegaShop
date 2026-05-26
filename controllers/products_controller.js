const fs = require("fs").promises;
const path = require("path");
const admin = require('../fcm');

DATA_FILE = path.join(__dirname, "../config/data.json")

async function readData() {
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Рендеринг страницы конкретного товара
function showProductPage(req, res) {
  try {
    let productId = parseInt(req.params.id);
    let productInfo = res.locals.data.products.find(p => p.id === productId);

    if (!productInfo){
      res.status(404).render("not_found", {
        message: "Товар не найден"
      });
    };

    res.render("product", {
      product: productInfo
    });
  } catch (err) {
    res.status(500).send("Ошибка сервера");
  }
}

// Рендеринг страницы всех товаров
function showProductsPage(req, res){
  try {
    res.render("products", {
      products: res.locals.data.products
    });
  } catch (err) {
    res.status(500).send("Ошибка сервера");
  }
}

// Возвращает товар по id в формате JSON
async function getProductJson(req, res) {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "Некорректный product id" });
    }

    const data = await readData();
    const product = (data.products || []).find((p) => p.id === productId);

    if (!product) {
      return res.status(404).json({ message: "Товар не найден" });
    }

    res.status(200).json(product);
  } catch (err) {
    res.status(500).json({message: 'Ошибка сервера'});
  }
}

//Возвращает список всех товаров в формате JSON
async function getProductsJson(req, res) {
  try {
    const data = await readData();
    res.status(200).json(data.products || []);
  } catch (err) {
    res.status(500).json({message: 'Ошибка сервера'});
  }
}

// Подписка пользователя на товар
async function subscribeToProduct(req, res) {
  try {
    const productId = parseInt(req.params.id);
    const { fcmToken } = req.body;
    const userId = req.session?.user?.id || req.session?.user?._id;

    if (!userId || !fcmToken) return res.status(400).json({ error: 'Нет токена или пользователя' });

    const data = await readData();
    const user = data.users.find(u => u.id === userId || u._id === userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    user.fcmTokens = user.fcmTokens || [];
    user.trackedProducts = user.trackedProducts || [];

    if (!user.fcmTokens.includes(fcmToken)) user.fcmTokens.push(fcmToken);
    if (!user.trackedProducts.includes(productId)) user.trackedProducts.push(productId);

    await writeData(data);
    res.json({ success: true, message: 'Подписка оформлена' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка подписки' });
  }
}

async function subscribeToProduct(req, res) {
  try {
    const productId = parseInt(req.params.id);
    const { fcmToken } = req.body;

    const userLogin = req.session?.user?.login;
    console.log(`Пользователь: ${userLogin}, товар: ${productId}, токен: ${fcmToken?.substring(0, 30)}...`);

    if (!userLogin || !fcmToken) {
      return res.status(400).json({ error: 'Нет токена или пользователя' });
    }

    const data = await readData();

    // Ищем по login, а не по id
    const userIndex = data.users.findIndex(u => u.login === userLogin);
    if (userIndex === -1) {
      console.error(`Пользователь "${userLogin}" не найден`);
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const user = data.users[userIndex];
    user.fcmTokens = user.fcmTokens || [];
    user.trackedProducts = user.trackedProducts || [];

    if (!user.fcmTokens.includes(fcmToken)) {
      user.fcmTokens.push(fcmToken);
      console.log(`Токен добавлен для ${userLogin}`);
    }
    if (!user.trackedProducts.includes(productId)) {
      user.trackedProducts.push(productId);
      console.log(`Товар #${productId} добавлен в отслеживаемые`);
    }

    await writeData(data);
    console.log(`Успех: ${userLogin} подписан на товар #${productId}`);
    res.json({ success: true, message: 'Подписка оформлена' });
  } catch (err) {
    console.error('Ошибка:', err);
    res.status(500).json({ error: 'Ошибка подписки: ' + err.message });
  }
}

// Отправка уведомлений при изменении цены
async function sendPriceChangeNotification(productId, product, users) {
  const tokens = [];
  users.forEach((u, i) => {
    const isTracking = u.trackedProducts?.includes(productId);
    const hasTokens = u.fcmTokens?.length > 0;

    if (isTracking && hasTokens) {
      console.log(`[FCM] Пользователь "${u.login}": токен(${u.fcmTokens.length}), товар #${productId} в отслеживаемых`);
      tokens.push(...u.fcmTokens);
    } else if (isTracking) {
      console.log(`[FCM] Пользователь "${u.login}" отслеживает товар, но нет токенов`);
    }
  });

  console.log(`[FCM] Всего токенов для отправки: ${tokens.length}`);

  if (tokens.length === 0) {
    console.log('[FCM] Нет подписок на этот товар');
    return;
  }

  const message = {
    notification: {
      title: `Цена на ${product.name} изменилась!`,
      body: `Старая цена: ${product.oldPrice}₽ → Новая: ${product.price}₽`,
    },
    tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[FCM] Отправлено: ${response.successCount} успешно, ${response.failureCount} ошибок`);

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`[FCM] Токен #${idx} ошибка:`, resp.error?.message);
        }
      });
    }
  } catch (err) {
    console.error('[FCM] Критическая ошибка отправки:', err);
  }
}

async function updateProductPrice(req, res) {
  try {
    const productId = parseInt(req.params.id);
    const newPrice = Number(req.body.newPrice);
    const data = await readData();
    const product = data.products.find(p => p.id === productId);

    if (!product || isNaN(newPrice)) return res.status(400).json({ error: 'Неверные данные' });

    const oldPrice = product.price;
    if (oldPrice === newPrice) return res.json({ success: true, message: 'Цена не изменилась' });

    product.price = newPrice;
    product.oldPrice = oldPrice;
    await writeData(data);

    await sendPriceChangeNotification(productId, product, data.users);
    res.json({ success: true, message: 'Цена обновлена, уведомления отправлены' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления цены' });
  }
}

module.exports = {
  showProductPage, 
  showProductsPage,
  getProductJson,
  getProductsJson,
  subscribeToProduct,
  updateProductPrice
}