import Button from "@/framework/ui/buttons/Button";
import Text from "@/framework/ui/iconText/Text";
import { border, radiusBig, shadow } from "@/config/theme";

/** What each part of AirSearcher does, in a few lines. The navbar's Info link. */
const SECTIONS: { title: string; body: string }[] = [
  {
    title: "What it does",
    body: "AirSearcher finds the best way for a group leaving Greece from several airports to reach one destination together: everyone flying direct, or gathering at one airport first.",
  },
  {
    title: "Departures and destinations",
    body: "Set how many people leave from each Greek airport. Add destinations as cities or single airports; an airport of a city already listed joins that city, and every airport of a destination is searched in the same requests.",
  },
  {
    title: "Where the flights come from",
    body: "SerpApi and Travelpayouts, or Google Flights through one pasted cURL. Each source has its own tab on the results page, ranked the same way.",
  },
  {
    title: "Your data",
    body: "Searches, filters and preferences are saved in a local database on this computer. Pasted cURLs contain your Google session and are never saved.",
  },
];

export default function InfoPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <Text size="large" value="About AirSearcher" className="font-semibold text-gray-900" />
        <Text size="small" value="How the app works, in short." className="text-gray-500" />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className={`flex flex-col gap-2 bg-white ${border} ${radiusBig} ${shadow} p-4 sm:p-5`}
          >
            <Text size="medium" value={section.title} className="font-semibold text-gray-900" />
            <Text size="small" value={section.body} className="text-gray-600" />
          </section>
        ))}
      </div>

      <div>
        <Button styleType="primary" href="/">
          <Text key="label" size="small" icon="search" value="Start a search" />
        </Button>
      </div>
    </div>
  );
}
