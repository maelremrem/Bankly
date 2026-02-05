# Bankly — Pocket Money Bank for Kids 🇬🇧🇫🇷

[![Build](https://img.shields.io/github/actions/workflow/status/your-org/Bankly/ci.yml?branch=main&style=flat-square)](https://github.com/your-org/Bankly/actions) [![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen?style=flat-square)](LICENSE) [![Backend](https://img.shields.io/badge/backend-v1.0.0-blue?style=flat-square)](backend/package.json) [![Docker](https://img.shields.io/badge/docker-ready-lightgrey?style=flat-square)]

**Make allowance time fun!** Bankly turns chores into small wins kids understand — colorful rewards, friendly UI, and clear parental controls. 🎈🧠💵

A local-first family app: private, safe, and playful. Perfect for routines, teaching moments, and weekly celebrations. ✅✨

---

## ✨ What is Bankly?
Bankly is an educational pocket-money simulator built for families. It helps kids learn about saving, earning, and responsible spending through task-based rewards, allowances, and transparent transaction history — while giving parents full control and oversight. 🧠💵

> Designed to be simple for kids and reassuring for parents: local-first, safe, and easy to use. ✅

---

## 🎯 Why parents will love it
- **Educational**: Teaches budgeting, saving, and delayed gratification. 📚
- **Safe & Private**: Runs locally (SQLite) or via Docker — no tracking or ads. 🔒
- **Parental control**: Admin dashboard to approve tasks, handle advances, and manage allowances. 🛡️
- **Hands-on**: Kids can earn by completing chores/tasks and see the result in real-time. 🧹➡️💸

---

## ⭐ Key features
- Automated allowances and customizable schedules ⏰
- Task creation, assignments, and approval workflow 📝✔️
- Advance/loan requests with parental approval 💳🔁
- Full transaction history, reversals and audit-friendly logs 📜
- Supports RFID login for IoT/PI setups (optional) 🆔🔐
- i18n ready (English & French) 🌍

---

## 🎨 Playful tour — screenshots

Take a quick peek — perfect for showing parents and kids what to expect!

<p float="left">
  <a href="docs/images/screenshot-dashboard.svg"><img src="docs/images/screenshot-dashboard.svg" width="360" alt="Dashboard screenshot" /></a>
  <a href="docs/images/screenshot-tasks.svg"><img src="docs/images/screenshot-tasks.svg" width="360" alt="Tasks screenshot" /></a>
</p>

> Tip: Try this live with your kid — celebrate the first chore reward together! 🎉

---

## 🧭 Quick start (developer)
Run locally (backend):

```bash
cd backend
npm install
npm run dev    # runs with nodemon
```

Seed an administrator account:

```bash
node scripts/seed-admin.js
```

Run tests:

```bash
npm test
```

Run with Docker (recommended for deployment):

```bash
docker-compose up -d
```

---

## 🖥️ Raspberry Pi & Hardware
Bankly supports deployment on Raspberry Pi (3B+ or newer). Optional RFID reader integration is included for hands-on, physical interactions (great for younger kids). See `scripts/rfid/` for details. 🐧🔧

---

## 🛡️ Safety & Privacy
- Local-first design: your data stays on your device or server 🔒
- Input validation and secure authentication (JWT, hashed PINs) 🧰
- Role-based access for parents vs kids 👪

---

## 🧽 For Parents — short pitch
Bankly turns chores into real, meaningful learning. It makes allowance management consistent and teaches kids financial responsibility in a safe, parent-managed environment. It’s a practical tool to help children grow confident with money — through play and routine. ❤️🌱

---

## 🤝 Contributing
Contributions, bug reports and ideas are welcome. Please open issues or PRs and follow the repository guidelines. See `docs/` for design notes and feature tracking.

---

## 📞 Contact & Support
If you want help setting Bankly up on a Raspberry Pi or need a demo for parents, open an issue or contact the maintainers in the repository. We’re happy to help! 🙌

---

## 📜 License
MIT — see `LICENSE`.

---

## 🇫🇷 Pitch rapide (en français)
Bankly aide les enfants à apprendre à gérer leur argent de poche de manière simple et ludique. Les parents gardent le contrôle, la vie privée est respectée, et tout est pensé pour l’apprentissage. Idéal pour initier des rituels de responsabilité financière en famille. 💙👨‍👩‍👧‍👦