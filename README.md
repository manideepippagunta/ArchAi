# ArchAi 🏠✨

ArchAi is a next-generation AI-powered Architectural Editor built with React, Vite, and Three.js. It allows users to instantly generate 2D floor plans and 3D architectural showcases simply by describing their dream home.

## 🌟 Killer Features

### 1. AI-Powered Predefined Layouts
Describe what you want (e.g., "Villa", "3 Bedroom House", "Studio Apartment"), and ArchAi will instantly generate a mathematically accurate structural layout.

### 2. High-Fidelity 3D Showcase
Seamlessly toggle between a 2D floorplan editor and a 3D "dollhouse" viewport. Rooms are color-coded, labeled, and populated with semantic placeholders.

### 3. 💾 Universal JSON Export
This is ArchAi's superpower. Click **Export** to instantly download your entire generated house as a structured `archai-layout-*.json` file. 
This JSON contains all exact coordinates for walls, rooms, types, and dimensions—making it **100% ready** to be imported into Blender, Unity, Unreal Engine, or custom CAD pipelines!

### 4. Interactive Editor
- **Command Palette** (`Ctrl+K`): Instantly switch tools or views.
- **Undo/Redo**: Full state history management.
- **Manual Overrides**: Draw walls and define spaces manually over the AI's generated base.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.9+
- Firebase account

### Frontend Setup
```bash
npm install
npm run dev
```
Visit `http://localhost:5174` (or `5173`) to view the application.

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
python main.py
```

---

## 📊 Dataset

Trained on a custom JSONL dataset of architectural descriptions mapped to structured 3D layouts. Training data located in `train.jsonl` and `custom_train.jsonl`.

---

## 🧪 Testing

```bash
npm run test
```

Playwright test suite covers UI flows and output validation.

---

## 📸 Demo

> *Screenshot / GIF of 3D output coming soon*

---

## 🛠️ Tech Stack
- React & Vite
- `react-three-fiber` & `drei` for 3D
- Zustand (with `zundo`) for state management
- Tailwind-style custom CSS tokens

## 👤 Author

**Ippagunta Venkata Manideep**
B.Tech CSE — BVRaju Institute of Technology
[GitHub](https://github.com/manideepippagunta) | [LinkedIn](#)

*Designed for the future of automated architecture.*
