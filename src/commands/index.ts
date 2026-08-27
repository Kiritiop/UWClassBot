import { Collection } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import enrollCommand from './enroll';
import enrollAllCommand from './enrollall';
import unenrollCommand from './unenroll';
import myclassesCommand from './myclasses';
import sectionsCommand from './sections';
import classmatesCommand from './classmates';
import privacyCommand from './privacy';
import adminCommand from './admin/index';
import anonymousCommand from './anonymous';
import leetcodeCommand from './leetcode';
import dailyLeetcodeCommand from './dailyLeetcode';

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export const commands = new Collection<string, Command>();
commands.set(enrollCommand.data.name, enrollCommand);
commands.set(enrollAllCommand.data.name, enrollAllCommand);
commands.set(unenrollCommand.data.name, unenrollCommand);
commands.set(myclassesCommand.data.name, myclassesCommand);
commands.set(sectionsCommand.data.name, sectionsCommand);
commands.set(classmatesCommand.data.name, classmatesCommand);
commands.set(privacyCommand.data.name, privacyCommand);
commands.set(adminCommand.data.name, adminCommand);
commands.set(anonymousCommand.data.name, anonymousCommand);
commands.set(leetcodeCommand.data.name, leetcodeCommand);
commands.set(dailyLeetcodeCommand.data.name, dailyLeetcodeCommand);
