/* eslint-disable react/require-default-props */

import { useWebSocket } from "@/context/websocket-context";
import { useEffect, useState } from "react";

type Message = {
    id: string;
    author: string;
    message: string;
};


// Main component
function YoutubeMessages(): JSX.Element {
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatId, setChatId] = useState<string | null>(null);
    const [nextPageToken, setNextPageToken] = useState<string | null>(null);
    const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
    const videoId = import.meta.env.VITE_LIVESTREAM_ID;

    const wsContext = useWebSocket();


    // Step 1: Get liveChatId
    const fetchLiveChatId = async () => {
        const res = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${apiKey}`
        );
        const data = await res.json();
        const liveChatId = data?.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
        setChatId(liveChatId);
    };

    // Step 2: Fetch live chat messages
    const fetchChatMessages = async () => {
        if (!chatId) return;

        const res = await fetch(
            `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${chatId}&part=snippet,authorDetails&key=${apiKey}&maxResults=10` +
            (nextPageToken ? `&pageToken=${nextPageToken}` : '')
        );

        const data = await res.json();
        setNextPageToken(data.nextPageToken);

        const newMessages: Message[] = data.items.map((item: any) => ({
            id: item.id,
            author: item.authorDetails.displayName,
            message: item.snippet.displayMessage,
        }));

        setMessages((prev) => [...prev, ...newMessages]);
    };


    // Init on load
    useEffect(() => {
        fetchLiveChatId();
    }, []);

    // Poll messages every 5 seconds
    useEffect(() => {
        if (!chatId) return;

        const interval = setInterval(() => {
            fetchChatMessages();
        }, 5000);

        return () => clearInterval(interval);
    }, [chatId, nextPageToken]);

    useEffect(() => {

        if (messages.length !== 0) {

            let main_message = ""
            messages.map(message => {
                main_message += `
                    =======
                    Author: ${message.author}
                    Message: ${message.message}
                    =======
                `
            })
            main_message = main_message + "These are messages from users, read them and select any random message which you like to reply to. Make it a fun conversation, also say the Authors name"

            wsContext.sendMessage({
                type: 'text-input',
                text: main_message.trim()
            });

            setMessages([]);
        }

    }, [messages])

    return (
        <>
        </>
    );
}

export default YoutubeMessages;
