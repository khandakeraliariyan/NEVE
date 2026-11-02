import { Link } from "react-router-dom";
import { COMPARE_MAX, useCompare } from "../lib/compare";

export default function CompareBar() {
    const compare = useCompare();
    if (compare.ids.length === 0) return null;
    return (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <div className="flex items-center gap-4 rounded-full bg-forest px-5 py-3 text-sm text-white shadow-lg">
                <span>
                    {compare.ids.length} of {COMPARE_MAX} selected to compare
                </span>
                <button type="button" onClick={compare.clear} className="text-white/70 underline">
                    Clear
                </button>
                <Link
                    to="/compare"
                    className={`rounded-full bg-white px-4 py-1.5 font-semibold text-forest ${compare.ids.length < 2 ? "pointer-events-none opacity-60" : ""}`}
                >
                    Compare →
                </Link>
            </div>
        </div>
    );
}
