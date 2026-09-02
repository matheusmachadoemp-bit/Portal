"use client";
import { Section } from "@/components/ui/stat-card";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
const data = [{ day: "Dom", online: 5700 }, { day: "Seg", online: 5900 }, { day: "Ter", online: 7900 }, { day: "Qua", online: 7800 }, { day: "Qui", online: 6300 }, { day: "Sex", online: 6200 }, { day: "Sáb", online: 5600 }];
export function BestPostingDays() { return <Section title="Melhor dia para postagens"><ResponsiveContainer width="100%" height={280}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" /><XAxis dataKey="day" stroke="#9a9aa2" fontSize={11} /><YAxis stroke="#9a9aa2" fontSize={11} /><Tooltip contentStyle={{ background: "#1a1a1d", border: "1px solid #2a2a2e", borderRadius: 8 }} /><Bar dataKey="online" name="Seguidores online" fill="#2952E3" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></Section>; }
