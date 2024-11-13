const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 7080 });

const cameras = {}; // Об'єкт для зберігання підключених камер
const clients = {}; // Об'єкт для зберігання підключених клієнтів

wss.on('connection', (ws, req) => {
  console.log('Підключено нового клієнта');

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    const { type, cameraId, boxId, frame } = data;

    if (type === 'camera') {
      // Якщо це камера, зберігаємо її підключення
      cameras[cameraId] = ws;
      console.log(`Камера ${cameraId} підключена`);
    } else if (type === 'client') {
      // Якщо це клієнт, зберігаємо його підключення
      if (!clients[boxId]) {
        clients[boxId] = [];
      }
      clients[boxId].push(ws);
      console.log(`Клієнт підключений до боксу ${boxId}`);
      // Запитуємо кадри від відповідної камери
      if (cameras[boxId]) {
        console.log("Запит кадрів від камери", boxId);
        cameras[boxId].send(JSON.stringify({ type: 'request', boxId }));
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Камера не підключена' }));
      }
    } else if (type === 'frame') {
      // Якщо це кадр від камери, передаємо його відповідним клієнтам
      if (clients[cameraId]) {
        clients[cameraId].forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'frame', frame: frame.replace(/^data:image\/jpeg;base64,/, '') }));
          }
        });
      }
    } else if (type === 'getStatus') {
      // Якщо це запит на статус, виводимо список підключених камер і клієнтів у консоль
      const cameraList = Object.keys(cameras);
      const clientList = Object.keys(clients);
      console.log('Підключені камери:', cameraList);
      console.log('Підключені клієнти:', clientList);
    }
  });

  ws.on('close', () => {
    console.log('Клієнт відключився');
    // Видаляємо камеру або клієнта з об'єктів cameras і clients, якщо вони відключилися
    for (const cameraId in cameras) {
      if (cameras[cameraId] === ws) {
        delete cameras[cameraId];
        console.log(`Камера ${cameraId} відключена`);
        break;
      }
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

console.log('WebSocket сервер запущено на ws://localhost:7080');