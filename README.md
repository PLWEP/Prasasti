# 🏛️ Prasasti: Automation Documentation

> **"Stop writing lazy commit messages. Let AI tell the true history."**

**Prasasti** is an intelligent VS Code extension designed specifically for **IFS ERP Technical Consultants**. It automates the tedious process of documenting `.plsql`, and `.plsvc` files by performing **Forensic Analysis** on your Git history using Google Gemini AI.

---

## ✨ Features

### 🕵️‍♂️ Forensic Documentation

Prasasti doesn't trust commit messages. It reads the **Raw Git Diff** to understand exactly what logic changed in your code.

-   **Result:** Accurate, business-logic-focused documentation (e.g., _"Updated tax calculation logic from 10% to 11%"_) instead of generic messages like _"fix bug"_.

### ⚡ Smart Auditing

-   **Real-time Monitoring:** Automatically detects when a file's header is older than its last Git commit.
-   **Smart Dirty Check:** Ignores changes that are just comments or whitespace. It only alerts you when **Logic** has changed.
-   **Native Caching:** Blazing fast performance. Scans huge repositories in seconds after the initial run.

### 🛠️ Legacy Friendly

-   **Respects History:** It preserves your old manual documentation.
-   **Standardization:** Automatically reformats messy legacy markers (e.g., `-- 050519 ERW Start`) into a clean, standardized format.

### 🚀 Productivity Boosters

-   **Single Click Fix:** Generate documentation for one file or the entire project with a single click.
-   **Incremental Updates:** AI intelligently reads only the _new_ commits since the last update to save tokens and time.
-   **Diff Preview:** Option to review AI-generated changes before applying them.

---

## 📸 Screenshots

### 1. The Dashboard

Files needing attention appear automatically in the **Prasasti Activity Bar**.

> _(Place a screenshot of your Sidebar here)_

### 2. Diagnostic Tooltip

Hover over a file to see exactly _why_ it is flagged.

> _(Place a screenshot of the hover tooltip here)_

---

## ⚙️ Getting Started

### 1. Prerequisites

-   **Git** must be installed and initialized in your workspace.
-   A **Google Gemini API Key** (Get it for free at [Google AI Studio](https://aistudio.google.com/)).

### 2. Installation

Install the `.vsix` file or download from the Marketplace.

### 3. Setup

1.  Open VS Code Settings (`Ctrl + ,`).
2.  Search for `Prasasti`.
3.  Enter your **Api Key**.

That's it! Open any IFS project folder, and Prasasti will start auditing.

---

## 🔧 Extension Settings

| Setting                  | Default                    | Description                                                                              |
| :----------------------- | :------------------------- | :--------------------------------------------------------------------------------------- |
| `prasasti.apiKey`        | `""`                       | **Required.** Your Google Gemini API Key.                                                |
| `prasasti.includedFiles` | `**/*.{plsql,apv,apy,sql}` | Glob pattern for files to audit.                                                         |
| `prasasti.autoApply`     | `true`                     | If `true`, AI overwrites the file immediately. If `false`, opens a Diff View for review. |
| `prasasti.maxRetries`    | `3`                        | Number of retries if the API hits a Rate Limit.                                          |

---

## 📖 How It Works

1.  **Code & Commit:** You modify a `.plsql` file and commit it to Git.
2.  **Detect:** Prasasti detects that the Git Commit Date is newer than the File Header Date.
3.  **Alert:** The file appears in the "Attention Needed" sidebar with a Yellow icon.
4.  **Generate:** You click the **Sparkle (✨)** icon.
    -   Prasasti fetches the Git Diff since the last update.
    -   Sends context to Gemini AI.
    -   Updates the File Header and adds Docstrings to methods.
5.  **Done:** The file is removed from the list.

---

## ⚠️ Disclaimer

This tool uses Generative AI to modify your source code. While it includes safety prompts to strictly preserve logic:

-   Always review the changes (use `prasasti.autoApply: false` for safety).
-   Commit your work before running the generator.

---

**Enjoy coding, let Prasasti handle the history.** 🗿
