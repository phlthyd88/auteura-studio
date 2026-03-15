# Auteura

Auteura is a professional-grade, real-time media engine and studio environment built entirely for the web. It combines high-performance WebGL rendering, Web Audio processing, and MediaPipe-powered AI vision into a unified, PWA-ready workspace for creators.

![Auteura Logo](./public/branding/auteura-main-logo.svg)

## 🎥 Key Features

- **Real-time Studio Rendering**: Custom GLRenderer pipeline with multi-pass effects (Beauty, CoreColor, MaskRefinement).
- **AI-Powered Vision**: Real-time face tracking, segmentation, and scene analysis using MediaPipe WASM tasks.
- **Pro Monitoring**: Built-in Histogram, RGB Parade, Vectorscope, and Audio Meters.
- **Virtual Output Bridge**: Integrated browser extension for routing high-quality video into standard web conferencing platforms.
- **Media Ingest & Editing**: IndexedDB-backed media library and timeline editor for rapid composition and preview.
- **Offline-First Resilience**: Full PWA support with service-worker caching and persistent local storage.

## 🛠 Tech Stack

- **Core**: React 18, TypeScript, Vite
- **UI**: Material UI (MUI) with custom brand primitives
- **Rendering**: WebGL 2.0 / custom RenderGraph architecture
- **Audio**: Web Audio API / AudioWorklet
- **AI**: MediaPipe Vision Tasks (WASM)
- **State & Persistence**: React Context, RxJS, IndexedDB (`idb`)

## 🚀 Getting Started

### Prerequisites

- Node.js >= 22.0.0
- npm >= 10.0.0

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/phlthyd88/auteura-studio.git
   cd auteura-studio
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## 🏗 Project Structure

- `src/engine/`: WebGL rendering pipeline and pass definitions.
- `src/controllers/`: Application logic orchestrators (Camera, AI, Recording, Timeline).
- `src/services/`: Persistence, hardware access, and heavy-lift utility services.
- `src/components/`: Modular UI system built on MUI.
- `extensions/`: Source for the Auteura Browser Camera extension.
- `public/models/`: MediaPipe WASM binaries and task models.

## 🧪 Quality & Testing

Auteura maintains high reliability via a multi-tiered testing strategy:

- **Unit/Integration**: Vitest for controller logic and service interactions.
- **E2E**: Playwright for critical path validation (camera init, recording, persistence).
- **Performance**: Integrated PerformanceMonitor and Profiler for frame-time analysis.

Run tests:
```bash
npm run test:unit
npm run test:e2e
```

## 🧾 Reliability Tracking

Open remediation and release-hardening work is tracked in [docs/tracking/release-stability-board.md](docs/tracking/release-stability-board.md). Use the ticket template in [docs/tracking/ticket-template.md](docs/tracking/ticket-template.md) for new reliability issues and release-gate work.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Built with ❤️ by Auteura Authors*
