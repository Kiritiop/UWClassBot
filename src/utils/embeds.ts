import { EmbedBuilder, Colors } from 'discord.js';
import type { Section, Course } from '../types';

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.Red).setDescription(message);
}

export function successEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.Green).setDescription(message);
}

export function infoEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.Blurple).setTitle(title).setDescription(description);
}

export function sectionLabel(section: Section): string {
  const parts: string[] = [`${section.section_type} ${section.section_number}`];
  if (section.days) parts.push(section.days);
  if (section.start_time) {
    const time = section.start_time.slice(0, 5);
    parts.push(section.end_time ? `${time}-${section.end_time.slice(0, 5)}` : time);
  }
  if (section.instructor) parts.push(section.instructor);
  if (section.location) parts.push(section.location);
  return parts.join(', ');
}

export function courseChannelName(subject: string, catalogNumber: string): string {
  return `${subject.toLowerCase()}-${catalogNumber.toLowerCase()}`;
}

export function sectionChannelName(
  subject: string,
  catalogNumber: string,
  sectionType: string,
  sectionNumber: string,
): string {
  return `${subject.toLowerCase()}-${catalogNumber.toLowerCase()}-${sectionType.toLowerCase()}-${sectionNumber}`;
}

export function courseRoleName(subject: string, catalogNumber: string): string {
  return `${subject} ${catalogNumber}`;
}

export function sectionRoleName(
  subject: string,
  catalogNumber: string,
  sectionType: string,
  sectionNumber: string,
): string {
  return `${subject} ${catalogNumber} ${sectionType} ${sectionNumber}`;
}
