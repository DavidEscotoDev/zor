# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-08-08

### Added
- **Project-folder working root**: zor-code now remembers a single project folder (`~/.zor/last-project.json`) that becomes the working root for all file tools, Bash, and session storage.
  - Interactive mode prompts for the folder only when nothing valid is remembered; piped mode never prompts.
  - Prompted relative paths are resolved to absolute before persisting.
- System prompt now announces the working directory to the model; project rule files (`ZOR.md`, `.zorrules`, `.zor/rules.md`) load from the project root.

### Changed
- `Read`/`Write`/`Edit`/`Glob`/`Grep`/`Bash`/`RAG` resolve against the project root instead of `process.cwd()`.
- Sessions live under the project root (`resolveSessionDir`) at all call sites; absolute `config.session.dir` is honored unchanged.
- Hardened `validatePath` traversal guard with a path-separator boundary.

### Fixed
- Windows path handling in prompt resolution and tool-path assertions.

## [0.5.0]
- (Pending)