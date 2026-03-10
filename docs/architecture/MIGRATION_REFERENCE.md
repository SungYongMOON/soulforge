# Migration Reference

## Purpose

This document tracks migration from earlier agent repository layouts into the Soulforge body-and-class model.

## Migration Direction

- move persistent identity and memory into `.agent/`
- move installable capabilities into `.agent_class/`
- move project-specific files into `_workspaces/`
- introduce `.project_agent/` only inside actual project folders

## Current Status

Migration rules are still being formalized.
This file serves as the initial reference point for future mapping decisions.
