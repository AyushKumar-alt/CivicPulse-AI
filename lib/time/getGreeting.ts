export interface Greeting {
  icon: string;
  title: string;
}

export function getGreeting(): Greeting {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12)  return { icon: "☀️",  title: "Good Morning, Command Centre" };
  if (hour >= 12 && hour < 17) return { icon: "🌤️", title: "Good Afternoon, Command Centre" };
  if (hour >= 17 && hour < 21) return { icon: "🌆", title: "Good Evening, Command Centre" };
  return { icon: "🌙", title: "Night Operations Briefing" };
}
