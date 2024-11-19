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
  
  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch (error) {
      // Якщо не вдалося розпарсити як JSON, вважаємо, що це бінарні дані
      data = message;
    }
    
    if (typeof data === 'object' && !Buffer.isBuffer(data)) {
      const { type, cameraId, boxId, command, angle, steps, direction } = data;

      if (type === 'camera') {
        // Камера підключилася
        cameras[cameraId] = ws;
        wsToCameraId.set(ws, cameraId);
        console.log(`Камера ${cameraId} підключена`);
      } else if (type === 'client') {
        // Клієнт підключився до боксу
        if (!clients[boxId]) {
          clients[boxId] = [];
        }
        clients[boxId].push(ws);
        console.log(`Клієнт підключений до боксу ${boxId}`);

        // Надсилаємо запит камері на передачу кадрів
        if (cameras[boxId]) {
          cameras[boxId].send(JSON.stringify({ type: 'request', boxId }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Камера не підключена' }));
        }
      } else if (type === 'command') {
        console.log("Команда", type, cameraId, boxId, command, angle, steps, direction);
        // Обробка команд для керування ESP-32 CAM
        if (cameras[boxId]) {
          cameras[boxId].send(JSON.stringify({ command, angle, steps, direction }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Камера не підключена' }));
        }
      } else if (type === 'getStatus') {
        // Запит статусу підключених камер і клієнтів
        const cameraList = Object.keys(cameras);
        const clientList = Object.keys(clients);
        console.log('Підключені камери:', cameraList);
        console.log('Підключені клієнти:', clientList);
        ws.send(JSON.stringify({ type: 'status', cameras: cameraList, clients: clientList }));
      }
    } else {
      // Обробка бінарних даних (наприклад, кадрів з камери)
      console.log('Received binary frame data of length: ' + message.length);

      // Знаходимо клієнтів для відповідного cameraId
      const cameraId = wsToCameraId.get(ws);
      if (!cameraId) {
        console.error('Не вдалося знайти cameraId для поточного WebSocket-з\'єднання');
        return;
      }
      const clientList = clients[cameraId];
      if (clientList && clientList.length > 0) {
        clientList.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message); // Відправляємо кадр клієнтам з відповідним cameraId
            console.log(`Кадр від камери ${cameraId} надіслано клієнту`);
          } else {
            console.log(`Клієнт ${cameraId} не готовий до отримання кадру`);
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
