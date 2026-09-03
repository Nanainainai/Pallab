import { FileText, PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LetterDatabase from './letter-database';

export default function Create() {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col w-full h-full">
            {/* Selection Buttons */}
            <div className="flex flex-row justify-between gap-3 mb-10 w-full">
                <button className="gap-2 w-full" onClick={() => navigate('/letter')}>
                    <span  className="font-bengali">চিঠি</span>
                    <PenLine />
                </button>
                <button className="gap-2 w-full" onClick={() => navigate('/report')}>
                    <span className="font-bengali">প্রতিবেদন</span>
                    <FileText />
                </button>
            </div>

            {/* Recently Used Templates */}
            <div className="w-full">
                <h2 className="mb-4 font-bengali font-bold text-4xl">সম্প্রতি প্রেরণকৃত</h2>
                <div>
                    <LetterDatabase />
                </div>
            </div>
        </div>
    );
}