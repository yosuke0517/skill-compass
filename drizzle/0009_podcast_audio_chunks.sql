CREATE TABLE `podcast_audio_chunks` (
	`episode_id` varchar(64) NOT NULL,
	`chunk_index` int NOT NULL,
	`status` varchar(32) NOT NULL,
	`storage_provider` varchar(32),
	`storage_key` varchar(1024),
	`media_type` varchar(96),
	`size_bytes` int,
	`attempts` int NOT NULL DEFAULT 0,
	`error_code` varchar(96),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `podcast_audio_chunks_episode_id_chunk_index_pk` PRIMARY KEY(`episode_id`,`chunk_index`),
	CONSTRAINT `podcast_audio_chunks_episode_id_fk` FOREIGN KEY (`episode_id`) REFERENCES `podcast_episodes`(`id`)
);
