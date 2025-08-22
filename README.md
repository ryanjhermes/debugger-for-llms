# AI-Powered Invisible Debugging Extension

An AI-optimized invisible logging and debugging tool for VSCode that automatically collects rich, structured runtime context during debugging sessions and leverages AI/LLM integration to provide precise, context-aware error diagnosis.

## Overview

This extension revolutionizes debugging workflows by:
- **Invisible Context Collection**: Automatically captures debugging data without cluttering your workflow
- **AI-Powered Analysis**: Sends structured context to LLMs for intelligent error diagnosis
- **Reduced AI Hallucinations**: Provides comprehensive runtime context for more accurate AI insights
- **Framework Agnostic**: Works with Node.js, Python, Java, and popular frameworks
- **Privacy First**: Automatic PII redaction and secure credential management

## Features

- 🔍 **Automatic Debug Context Collection**: Captures variables, stack traces, console outputs, and network activity
- 🤖 **Multi-AI Provider Support**: Integrates with OpenAI, HuggingFace, and other LLM services
- 🛡️ **Privacy & Security**: Built-in data redaction and secure API key storage
- ⚡ **Performance Optimized**: < 5% overhead on debugging sessions
- 🔧 **Extensible Middleware**: Support for custom framework instrumentation
- 📊 **Clean UI**: Non-intrusive side panel for AI insights and diagnostics

## Quick Start

1. Install the extension from VSCode Marketplace
2. Configure your AI provider API key in settings
3. Start debugging your code normally
4. Toggle "AI Debug Mode" to enable intelligent analysis
5. View AI-powered insights in the dedicated side panel

## Development

This project follows spec-driven development. See the `.kiro/specs/ai-debug-extension/` directory for:
- `requirements.md` - Detailed feature requirements
- `design.md` - Technical architecture and design decisions  
- `tasks.md` - Implementation plan and coding tasks

## Contributing

We welcome contributions! Please see our contributing guidelines and check the task list for areas where you can help.

## License

MIT License - see LICENSE file for details