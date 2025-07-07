/* eslint-disable react/require-default-props */

import { useBgUrl } from "@/context/bgurl-context";
import { useWebSocket } from "@/context/websocket-context";
import { useEffect, useState, useCallback, useRef } from "react";

type News = {
    id: number;
    title: string;
    description: string;
    source: string;
    image: string;
    isRead: boolean;
    createdAt: string;
    updatedAt: string;
};

type ApiResponse = {
    success: boolean;
    data?: News;
    message?: string;
};

// Main component
function NewsFeed(): JSX.Element {
    const [news, setNews] = useState<News | null>(null);
    const { setNewsImageUrl } = useBgUrl();
    const [error, setError] = useState<string | null>(null);
    const lastNewsIdRef = useRef<number | null>(null);
    const isLoadingRef = useRef<boolean>(false);
    const wsContext = useWebSocket();

    const fetchNews = useCallback(async () => {
        if (isLoadingRef.current) {
            console.log('Already loading, skipping fetch...');
            return;
        }

        isLoadingRef.current = true;
        setError(null);

        try {
            console.log('Fetching news...');
            const res = await fetch(`https://backend.spredd.markets/dashboard/news`);

            if (res.status === 404) {
                console.log('No unread news available');
                setError('No unread news available');
                return;
            }

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const data: ApiResponse = await res.json();

            if (data.success && data.data) {
                if (lastNewsIdRef.current !== data.data.id) {
                    setNews(data.data);
                    setNewsImageUrl(data.data.image);
                    lastNewsIdRef.current = data.data.id;
                    console.log('New news fetched:', data.data.title);
                } else {
                    console.log('Same news as before, skipping...');
                }
            } else {
                setError(data.message || 'Failed to fetch news');
            }
        } catch (err) {
            console.error('Error fetching news:', err);
            setError(err instanceof Error ? err.message : 'Unknown error occurred');
        } finally {
            isLoadingRef.current = false;
        }
    }, []);

    // Send news to websocket when new news is available
    useEffect(() => {
        if (news == null || !wsContext) {
            return;
        }

        const main_message = `
            New News Alert! 📰
            Title: ${news.title}
            Description: ${news.description}
            Source: ${news.source}
        `.trim();

        try {
            wsContext.sendMessage({
                type: 'text-input',
                text: main_message
            });
            console.log('News sent to websocket:', news.id);
        } catch (err) {
            console.error('Error sending message to websocket:', err);
        }

        setNews(null);
    }, [news, wsContext]);

    useEffect(() => {
        console.log('Component mounted, fetching initial news');
        fetchNews();
    }, []);

    useEffect(() => {
        console.log('Setting up 15-second interval');
        const interval = setInterval(() => {
            console.log('Interval triggered - fetching news');
            fetchNews();
        }, 60000); // 30 seconds

        return () => {
            console.log('Cleaning up interval');
            clearInterval(interval);
        };
    }, []);

    return (
        <>
        </>
    );
}

export default NewsFeed;