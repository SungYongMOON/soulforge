#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"

SCRIPT_DIR = File.expand_path(__dir__)
REPO_ROOT = File.expand_path("../../../..", SCRIPT_DIR)
SKILLS_ROOT = File.join(REPO_ROOT, ".registry", "skills")
CODEX_HOME = ENV.fetch("CODEX_HOME", File.expand_path("~/.codex"))
INSTALL_ROOT = File.join(CODEX_HOME, "skills")

def usage
  warn "usage: ruby .registry/docs/operations/scripts/sync_codex_skill.rb <skill_id> [skill_id ...] | --all"
  exit 1
end

def available_skill_ids(skills_root)
  Dir.children(skills_root).select do |entry|
    bridge_skill = File.join(skills_root, entry, "codex", "SKILL.md")
    File.directory?(File.join(skills_root, entry)) && File.file?(bridge_skill)
  end.sort
end

def sync_skill(skills_root, install_root, skill_id)
  source_dir = File.join(skills_root, skill_id, "codex")
  source_skill = File.join(source_dir, "SKILL.md")
  raise "missing codex bridge for #{skill_id}" unless File.file?(source_skill)

  install_name = "soulforge-#{skill_id.tr('_', '-')}"
  target_dir = File.join(install_root, install_name)
  FileUtils.rm_rf(target_dir)
  FileUtils.mkdir_p(target_dir)

  Dir.children(source_dir).each do |entry|
    source = File.join(source_dir, entry)
    target = File.join(target_dir, entry)
    FileUtils.cp_r(source, target)
  end

  puts "synced #{skill_id} -> #{target_dir}"
end

args = ARGV.dup
usage if args.empty?

skill_ids =
  if args == ["--all"]
    available_skill_ids(SKILLS_ROOT)
  else
    args
  end

if skill_ids.empty?
  warn "no syncable Soulforge skills found under #{SKILLS_ROOT}"
  exit 1
end

FileUtils.mkdir_p(INSTALL_ROOT)

skill_ids.each do |skill_id|
  sync_skill(SKILLS_ROOT, INSTALL_ROOT, skill_id)
end
