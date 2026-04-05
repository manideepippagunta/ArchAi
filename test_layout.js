import { generateLayout } from './src/systems/RoomLayoutEngine.js';

console.time('layout');
const result = generateLayout('3-bedroom house', 3, 0, 0);
console.timeEnd('layout');

console.log('Rooms generated:', result.rooms.length);
console.log('Walls generated:', result.walls.length);
result.rooms.forEach(r => console.log(`${r.type}: ${r.x}, ${r.y}, ${r.width}, ${r.height}`));
