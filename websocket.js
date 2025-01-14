const express = require('express');
const WebSocket = require('ws');
const app = express();
const http = require('http');
const server = http.createServer(app);
const wsToCameraId = new Map();   // Відповідність між WebSocket-з'єднанням і cameraId

// Налаштування заголовка CSP для HTTP/HTTPS сервера
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' wss://*;");
  next();
});

// Створення WebSocket сервера
const wss = new WebSocket.Server({ server, path: '/ws' });

const cameras = {}; // Зберігання підключених камер
const clients = {}; // Зберігання підключених клієнтів

wss.on('connection', (ws, req) => {
  console.log('Підключено нового клієнта');
  
  // Обробка запиту клієнта
ws.on('message', (message) => {
  let data;
  try {
    data = JSON.parse(message.toString());
  } catch (error) {
    data = message; // Обробка бінарних даних
  }

  if (typeof data === 'object' && !Buffer.isBuffer(data)) {
    const { type, cameraId, boxId, command, angle, steps, direction } = data;

    if (type === 'client') {
      // Клієнт підключився
      const singleCameraId = Object.keys(cameras)[0]; // Єдина камера в масиві

      if (singleCameraId) {
        // Якщо єдина камера існує
        if (!clients[singleCameraId]) {
          clients[singleCameraId] = [];
        }
        clients[singleCameraId].push(ws);
        console.log(`Клієнт підключений до камери ${singleCameraId}`);

        // Надсилаємо запит єдиній камері на передачу кадрів
        cameras[singleCameraId].send(JSON.stringify({ type: 'request', boxId: singleCameraId }));
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Жодна камера не підключена' }));
      }
    } else if (type === 'command') {
      // Обробка команди
      const singleCameraId = Object.keys(cameras)[0]; // Єдина камера в масиві

      if (singleCameraId) {
        cameras[singleCameraId].send(JSON.stringify({ command, angle, steps, direction }));
        console.log(`Команду надіслано камері ${singleCameraId}`);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Жодна камера не підключена' }));
      }
    }
  } else {
    // Обробка бінарних даних
    console.log('Received binary frame data of length: ' + message.length);

    const singleCameraId = Object.keys(cameras)[0]; // Єдина камера в масиві
    if (!singleCameraId) {
      console.error('Жодна камера не підключена для передачі даних');
      return;
    }

    const clientList = clients[singleCameraId];
    if (clientList && clientList.length > 0) {
      clientList.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message); // Відправляємо кадри клієнтам
          console.log(`Кадр від камери ${singleCameraId} надіслано клієнту`);
        } else {
          console.log(`Клієнт ${singleCameraId} не готовий до отримання кадру`);
        }
      });
    }
  }
});

  ws.on('close', () => {
    console.log('Клієнт відключився');
    const cameraId = wsToCameraId.get(ws);
    if (cameraId) {
      delete cameras[cameraId];
      wsToCameraId.delete(ws);
      console.log(`Камера ${cameraId} відключена`);
    }
    for (const boxId in clients) {
      clients[boxId] = clients[boxId].filter((client) => client !== ws);
      if (clients[boxId].length === 0) {
        delete clients[boxId];
      }
      console.log(`Клієнт відключений від боксу ${boxId}`);
    }
  });

  ws.on('error', (error) => {
    console.error('Помилка WebSocket:', error);
  });
});

// Запускаємо сервер
server.listen(process.env.PORT || 7080, () => {
  console.log('Сервер запущено на порту', process.env.PORT || 7080);
});
