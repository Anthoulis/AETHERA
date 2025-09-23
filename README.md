# AETHERA Website

**AETHERA** is a premium Greek brand from Kos Island, starting with honey and expanding into more natural products.  
This repository contains the official website for promoting our products.  

---

## 🌱 Current Phase
We start simple with a **static HTML + CSS site** for fast implementation.  
Later, we will experiment with **Next.js** and **Laravel** in separate branches before deciding the long-term stack.

- **`main` branch** → Static site (HTML + CSS)  
- **`nextjs-version` branch** → Next.js (React + TypeScript + Tailwind) experiment  
- **`laravel-version` branch** → Laravel (PHP + Blade templates) experiment  

---

## 📂 Project Structure
```
aethera-website/
│
├── index.html             # Home
├── about.html             # About page
├── products.html          # Products overview
├── wholesale.html         # Wholesale info
├── sustainability.html    # Sustainability page
├── contact.html           # Contact page
│
├── legal/
│   ├── privacy.html
│   └── terms.html
│
└── assets/
    ├── css/
    │   └── style.css      # Global CSS
    ├── images/            # Logos, product images
    └── docs/              # PDFs, lab results, resources
```
---

## ⚙️ Getting Started

### Requirements
- [Visual Studio Code](https://code.visualstudio.com/)  
- (optional) [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) for hot reload  
- Git for version control  

### Run Locally
1. Clone the repo:
   bash
   git clone https://github.com/YOUR-USERNAME/aethera-website.git
   cd aethera-website

2. Open the project in VS Code:
   bash
   code .
   
3. Open `index.html` in your browser  
   or use **Live Server** for auto-reload.

---

## 🚀 Future Plans
- Add **Next.js** branch with React + TypeScript + Tailwind (modern, SEO-friendly stack).  
- Add **Laravel** branch for backend-heavy experimentation.  
- Introduce e-commerce: shopping cart, account system (Google/Apple sign-in), Stripe/PayPal integration.  
- Expand into multi-language (English & Greek).  
- Deploy on **Vercel / Netlify** (static or Next.js) or custom server (Laravel).  

---

## 📜 License
All rights reserved © 2025 AETHERA.
